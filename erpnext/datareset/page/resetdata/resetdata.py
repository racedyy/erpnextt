import frappe
from frappe.utils import cint

@frappe.whitelist()
def check_table_exists(doctype):
    """Vérifie si une table existe dans la base de données"""
    table_name = f"tab{doctype}"
    result = frappe.db.sql("""
        SELECT COUNT(*)
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
        AND table_name = %s
    """, (table_name,))
    return cint(result[0][0]) > 0

@frappe.whitelist()
def get_table_count(doctype):
    """Obtient le nombre d'enregistrements dans une table si elle existe"""
    if check_table_exists(doctype):
        return frappe.db.count(doctype)
    return 0

@frappe.whitelist()
def reset_all_data():
    # Liste des Doctypes métier à vider
    doctypes_to_reset = [
        "Customer",
        "Supplier",
        "Sales Invoice",
        "Purchase Invoice",
        "Item",
        "Sales Order",
        "Purchase Order",
        "Quotation",
        "Supplier Quotation",
        "Material Request",  # Ajout des demandes de matériel
        "Delivery Note",
        "Stock Entry",
        "Project",
        "Task",
        "Lead",
        "Opportunity",
        "Employee",
        "Attendance",
        "Timesheet"
    ]

    results = []
    for doctype in doctypes_to_reset:
        try:
            if check_table_exists(doctype):
                count_before = frappe.db.count(doctype)
                frappe.db.sql(f"DELETE FROM `tab{doctype}`")
                frappe.db.commit()
                results.append({
                    "doctype": doctype,
                    "status": "success",
                    "message": f"✅ {doctype} vidé. ({count_before} enregistrements supprimés)",
                    "count_before": count_before,
                    "count_after": 0
                })
            else:
                results.append({
                    "doctype": doctype,
                    "status": "warning",
                    "message": f"⚠️ La table {doctype} n'existe pas",
                    "count_before": 0,
                    "count_after": 0
                })
        except Exception as e:
            results.append({
                "doctype": doctype,
                "status": "error",
                "message": f"⚠️ Erreur en vidant {doctype}: {str(e)}",
                "error": str(e)
            })

    # Réinitialiser les valeurs de stock
    try:
        # Mettre à jour les valeurs de stock à 0 pour tous les articles
        frappe.db.sql("""
            UPDATE `tabItem`
            SET opening_stock = 0,
                standard_rate = 0,
                valuation_rate = 0
            WHERE docstatus < 2
        """)
        frappe.db.commit()
        
        # Supprimer les entrées de stock
        if check_table_exists("Stock Ledger Entry"):
            frappe.db.sql("DELETE FROM `tabStock Ledger Entry`")
            frappe.db.commit()
            
        # Supprimer l'historique des valorisations
        if check_table_exists("Stock Value History"):
            frappe.db.sql("DELETE FROM `tabStock Value History`")
            frappe.db.commit()

        # Réinitialiser les bins (stock des entrepôts)
        if check_table_exists("Bin"):
            frappe.db.sql("""
                UPDATE `tabBin`
                SET actual_qty = 0,
                    ordered_qty = 0,
                    reserved_qty = 0,
                    indented_qty = 0,
                    planned_qty = 0,
                    projected_qty = 0,
                    reserved_qty_for_production = 0,
                    reserved_qty_for_sub_contract = 0,
                    reserved_qty_for_production_plan = 0,
                    stock_value = 0,
                    valuation_rate = 0
            """)
            frappe.db.commit()
            
        results.append({
            "doctype": "Stock Values",
            "status": "success",
            "message": "✅ Valeurs de stock réinitialisées",
            "count_before": "N/A",
            "count_after": 0
        })
    except Exception as e:
        results.append({
            "doctype": "Stock Values",
            "status": "error",
            "message": f"⚠️ Erreur en réinitialisant les valeurs de stock: {str(e)}",
            "error": str(e)
        })

    return {
        "status": "success",
        "message": "🎉 Opération terminée avec succès.",
        "results": results
    }
