import frappe
import csv
import json
from frappe.utils import cint, cstr
from frappe.utils.csvutils import read_csv_content

@frappe.whitelist()
def detect_doctype(file_content):
    """Détecte automatiquement le DocType basé sur les en-têtes du CSV"""
    try:
        rows = read_csv_content(file_content)
        if not rows:
            return {
                "status": "error",
                "message": "Le fichier CSV est vide"
            }

        headers = rows[0]
        if not headers:
            return {
                "status": "error",
                "message": "Aucun en-tête trouvé dans le fichier CSV"
            }

        # Normaliser les en-têtes
        headers = [h.strip().lower() for h in headers]

        # Obtenir tous les DocTypes installés
        doctypes = frappe.get_all("DocType", filters={"custom": 0, "istable": 0}, fields=["name"])
        
        matches = []
        for dt in doctypes:
            doctype = dt.name
            meta = frappe.get_meta(doctype)
            fields = {df.fieldname.lower(): df for df in meta.fields}
            field_labels = {df.label.lower(): df for df in meta.fields if df.label}
            
            # Calculer le score de correspondance
            match_score = 0
            matched_fields = []
            for header in headers:
                if header in fields or header in field_labels:
                    match_score += 1
                    matched_fields.append(header)

            if match_score > 0:
                score_percent = (match_score / len(headers)) * 100
                matches.append({
                    "doctype": doctype,
                    "score": score_percent,
                    "matched_fields": matched_fields,
                    "total_fields": len(headers)
                })

        # Trier par score de correspondance
        matches.sort(key=lambda x: x["score"], reverse=True)

        # Retourner les 5 meilleures correspondances
        best_matches = matches[:5]

        return {
            "status": "success",
            "matches": best_matches
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def import_csv_data(file_content=None, doctype=None, submit=False, auto_detect=False):
    """Import CSV data with dynamic columns and optional doctype detection"""
    try:
        # Lire le contenu CSV
        rows = read_csv_content(file_content)
        if not rows:
            return {
                "status": "error",
                "message": "Le fichier CSV est vide"
            }

        headers = rows[0]
        data = rows[1:]

        if not headers or not data:
            return {
                "status": "error",
                "message": "Format de fichier CSV invalide"
            }

        if auto_detect and not doctype:
            # Tenter de détecter automatiquement le DocType
            detection_result = detect_doctype(file_content)
            if detection_result["status"] == "success" and detection_result["matches"]:
                doctype = detection_result["matches"][0]["doctype"]
            else:
                return {
                    "status": "error",
                    "message": "Impossible de détecter automatiquement le type de document"
                }

        if not doctype:
            return {
                "status": "error",
                "message": "Type de document non spécifié et détection automatique désactivée"
            }

        # Vérifier si le doctype existe
        if not frappe.db.exists("DocType", doctype):
            return {
                "status": "error",
                "message": f"DocType {doctype} n'existe pas"
            }

        # Récupérer les champs du doctype
        meta = frappe.get_meta(doctype)
        doctype_fields = {df.fieldname: df for df in meta.fields}
        field_labels = {df.label.lower(): df.fieldname for df in meta.fields if df.label}

        # Mapper automatiquement les colonnes avec les champs
        field_map = {}
        for idx, header in enumerate(headers):
            header_lower = header.strip().lower()
            if header_lower in doctype_fields:
                field_map[idx] = header_lower
            elif header_lower in field_labels:
                field_map[idx] = field_labels[header_lower]

        # Importer les données
        results = {
            "success": [],
            "errors": [],
            "doctype_used": doctype
        }

        for row_idx, row in enumerate(data, start=2):
            try:
                doc_data = {
                    "doctype": doctype
                }

                # Mapper les colonnes aux champs
                for col_idx, field_name in field_map.items():
                    if col_idx < len(row):
                        value = row[col_idx].strip() if row[col_idx] else None
                        if value:
                            field = doctype_fields[field_name]
                            value = convert_value(value, field)
                            doc_data[field_name] = value

                # Créer le document
                doc = frappe.get_doc(doc_data)
                doc.insert()
                
                if submit and doc.is_submittable():
                    doc.submit()

                results["success"].append({
                    "row": row_idx,
                    "name": doc.name
                })

            except Exception as e:
                results["errors"].append({
                    "row": row_idx,
                    "error": str(e),
                    "data": row
                })

        return {
            "status": "success",
            "message": f"Import terminé : {len(results['success'])} succès, {len(results['errors'])} erreurs",
            "details": results
        }

    except Exception as e:
        frappe.log_error(f"Erreur lors de l'import CSV : {str(e)}")
        return {
            "status": "error",
            "message": f"Erreur lors de l'import : {str(e)}"
        }

def convert_value(value, field):
    """Convertir la valeur selon le type de champ"""
    fieldtype = field.fieldtype

    if not value:
        return None

    try:
        if fieldtype in ["Int", "Check"]:
            return cint(value)
        elif fieldtype in ["Float", "Currency", "Percent"]:
            return float(value)
        elif fieldtype == "Date":
            return frappe.utils.getdate(value)
        elif fieldtype == "Datetime":
            return frappe.utils.get_datetime(value)
        else:
            return cstr(value)
    except Exception as e:
        frappe.log_error(f"Erreur de conversion pour {field.fieldname}: {str(e)}")
        return value

@frappe.whitelist()
def get_doctype_fields(doctype):
    """Obtenir la liste des champs d'un doctype"""
    try:
        meta = frappe.get_meta(doctype)
        fields = []
        
        for df in meta.fields:
            if not df.hidden and not df.read_only:
                fields.append({
                    "fieldname": df.fieldname,
                    "label": df.label,
                    "fieldtype": df.fieldtype,
                    "reqd": df.reqd
                })
                
        return {
            "status": "success",
            "fields": fields
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def analyze_csv_structure(file_content):
    """Analyser la structure d'un fichier CSV"""
    try:
        rows = read_csv_content(file_content)
        if not rows:
            return {
                "status": "error",
                "message": "Le fichier CSV est vide"
            }

        headers = rows[0]
        sample_data = rows[1] if len(rows) > 1 else []

        analysis = {
            "column_count": len(headers),
            "columns": [],
            "row_count": len(rows) - 1  # Exclure l'en-tête
        }

        for idx, header in enumerate(headers):
            col_info = {
                "index": idx,
                "header": header,
                "sample": sample_data[idx] if sample_data and idx < len(sample_data) else None
            }
            analysis["columns"].append(col_info)

        return {
            "status": "success",
            "analysis": analysis
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
