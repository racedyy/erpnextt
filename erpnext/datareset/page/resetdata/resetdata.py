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

    return {
        "status": "success",
        "message": "🎉 Opération terminée avec succès.",
        "results": results
    }
