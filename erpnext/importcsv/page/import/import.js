frappe.pages['import'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Importation données CSV',
        single_column: true
    });

    // Ajouter les sections principales
    var $content = $(`
        <div class="import-main">
            <div class="import-section">
                <div class="section-header">1. Charger le fichier CSV</div>
                <div class="file-upload"></div>
                <div class="file-analysis"></div>
            </div>

            <div class="import-section doctype-section">
                <div class="section-header">2. Type de document</div>
                <div class="doctype-mode-selection">
                    <div class="mode-toggle">
                        <label>
                            <input type="radio" name="doctype-mode" value="auto" checked> 
                            Détection automatique
                        </label>
                        <label>
                            <input type="radio" name="doctype-mode" value="manual"> 
                            Sélection manuelle
                        </label>
                    </div>
                </div>
                <div class="doctype-auto hide">
                    <div class="detected-doctypes"></div>
                </div>
                <div class="doctype-manual hide">
                    <div class="doctype-selection"></div>
                </div>
            </div>
            
            <div class="import-section mapping-section hide">
                <div class="section-header">3. Mapper les colonnes</div>
                <div class="column-mapping"></div>
            </div>
            
            <div class="import-section">
                <div class="section-header">4. Options d'import</div>
                <div class="import-options"></div>
            </div>
            
            <div class="import-section">
                <div class="import-status"></div>
            </div>
        </div>
    `).appendTo(page.main);

    // Ajouter le style CSS
    frappe.dom.set_style(`
        .import-main {
            padding: 15px;
        }
        .import-section {
            margin-bottom: 30px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .section-header {
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--text-color);
        }
        .mode-toggle {
            margin-bottom: 15px;
        }
        .mode-toggle label {
            margin-right: 20px;
        }
        .doctype-card {
            padding: 15px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            margin-bottom: 10px;
            cursor: pointer;
        }
        .doctype-card:hover {
            background-color: var(--bg-light-gray);
        }
        .doctype-card.selected {
            border-color: var(--primary);
            background-color: var(--bg-light-blue);
        }
        .doctype-score {
            float: right;
            color: var(--text-muted);
        }
        .matched-fields {
            font-size: 0.9em;
            color: var(--text-muted);
            margin-top: 5px;
        }
        .file-analysis {
            margin-top: 15px;
        }
        .mapping-table {
            width: 100%;
            margin-top: 15px;
        }
        .mapping-table td {
            padding: 8px;
            border-bottom: 1px solid var(--border-color);
        }
        .import-status {
            margin-top: 15px;
        }
        .status-message {
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .status-success {
            background-color: var(--alert-green-bg);
            color: var(--alert-green);
        }
        .status-error {
            background-color: var(--alert-red-bg);
            color: var(--alert-red);
        }
    `);

    // Initialiser la page
    new ImportPage(page, $content);
};

class ImportPage {
    constructor(page, $content) {
        this.page = page;
        this.$content = $content;
        this.setup();
    }

    setup() {
        this.setup_doctype_mode();
        this.setup_file_upload();
        this.setup_doctype_selection();
        this.setup_import_options();
        this.setup_primary_action();
    }

    setup_doctype_mode() {
        this.$content.find('input[name="doctype-mode"]').on('change', (e) => {
            const mode = $(e.target).val();
            if (mode === 'auto') {
                this.$content.find('.doctype-auto').removeClass('hide');
                this.$content.find('.doctype-manual').addClass('hide');
                if (this.file_url) {
                    this.detect_doctype();
                }
            } else {
                this.$content.find('.doctype-auto').addClass('hide');
                this.$content.find('.doctype-manual').removeClass('hide');
            }
        });
    }

    setup_file_upload() {
        let file_uploader = frappe.ui.form.make_control({
            parent: this.$content.find('.file-upload'),
            df: {
                label: 'Fichier CSV',
                fieldtype: 'Attach',
                reqd: 1,
                change: () => {
                    this.file_url = file_uploader.get_value();
                    if (this.file_url) {
                        this.analyze_file();
                        if (this.$content.find('input[name="doctype-mode"]:checked').val() === 'auto') {
                            this.detect_doctype();
                        }
                    }
                }
            }
        });
        file_uploader.refresh();
    }

    setup_doctype_selection() {
        let doctypes_control = frappe.ui.form.make_control({
            parent: this.$content.find('.doctype-manual'),
            df: {
                label: 'Type de document',
                fieldtype: 'Link',
                options: 'DocType',
                change: () => {
                    this.doctype = doctypes_control.get_value();
                    this.load_doctype_fields();
                }
            }
        });
        doctypes_control.refresh();
    }

    detect_doctype() {
        frappe.call({
            method: 'erpnext.importcsv.page.import.import.detect_doctype',
            args: { file_content: this.file_url },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.show_detected_doctypes(r.message.matches);
                }
            }
        });
    }

    show_detected_doctypes(matches) {
        const $container = this.$content.find('.detected-doctypes').empty();
        
        if (!matches || matches.length === 0) {
            $container.html(`
                <div class="alert alert-warning">
                    Aucun type de document correspondant trouvé
                </div>
            `);
            return;
        }

        matches.forEach(match => {
            const $card = $(`
                <div class="doctype-card" data-doctype="${match.doctype}">
                    <div class="doctype-score">${Math.round(match.score)}% de correspondance</div>
                    <div class="doctype-name">${match.doctype}</div>
                    <div class="matched-fields">
                        ${match.matched_fields.length} champs correspondants sur ${match.total_fields}
                    </div>
                </div>
            `).appendTo($container);

            $card.on('click', () => {
                this.$content.find('.doctype-card').removeClass('selected');
                $card.addClass('selected');
                this.doctype = match.doctype;
                this.load_doctype_fields();
            });
        });
    }

    setup_import_options() {
        let submit_control = frappe.ui.form.make_control({
            parent: this.$content.find('.import-options'),
            df: {
                label: 'Soumettre après import',
                fieldtype: 'Check',
                change: () => {
                    this.submit_after_import = submit_control.get_value();
                }
            }
        });
        submit_control.refresh();
    }

    setup_primary_action() {
        this.page.set_primary_action('Importer', () => this.start_import());
    }

    analyze_file() {
        frappe.call({
            method: 'erpnext.importcsv.page.import.import.analyze_csv_structure',
            args: { file_content: this.file_url },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.file_analysis = r.message.analysis;
                    this.show_file_analysis();
                    this.update_mapping_section();
                }
            }
        });
    }

    show_file_analysis() {
        let $analysis = this.$content.find('.file-analysis');
        $analysis.html(`
            <div class="alert alert-info">
                Fichier analysé : ${this.file_analysis.column_count} colonnes, 
                ${this.file_analysis.row_count} lignes de données
            </div>
        `);
    }

    load_doctype_fields() {
        if (!this.doctype) return;
        
        frappe.call({
            method: 'erpnext.importcsv.page.import.import.get_doctype_fields',
            args: { doctype: this.doctype },
            callback: (r) => {
                if (r.message && r.message.status === 'success') {
                    this.doctype_fields = r.message.fields;
                    this.update_mapping_section();
                }
            }
        });
    }

    update_mapping_section() {
        if (!this.doctype_fields || !this.file_analysis) return;

        let $mapping = this.$content.find('.column-mapping');
        $mapping.empty();

        let table = $('<table class="mapping-table">').appendTo($mapping);
        
        // En-têtes
        let header_row = $('<tr>').appendTo(table);
        $('<th>').text('Colonne CSV').appendTo(header_row);
        $('<th>').text('Champ DocType').appendTo(header_row);
        $('<th>').text('Exemple').appendTo(header_row);

        // Lignes de mapping
        this.file_analysis.columns.forEach(col => {
            let row = $('<tr>').appendTo(table);
            $('<td>').text(col.header).appendTo(row);
            
            let field_select = $('<select>').appendTo($('<td>').appendTo(row));
            $('<option>').val('').text('-- Ignorer --').appendTo(field_select);
            
            this.doctype_fields.forEach(df => {
                let option = $('<option>')
                    .val(df.fieldname)
                    .text(df.label + (df.reqd ? ' (Obligatoire)' : ''))
                    .appendTo(field_select);
                
                // Auto-mapper si les noms correspondent
                if (col.header.toLowerCase() === df.fieldname.toLowerCase() ||
                    col.header.toLowerCase() === df.label.toLowerCase()) {
                    option.prop('selected', true);
                }
            });

            $('<td>').text(col.sample || '').appendTo(row);
        });

        this.$content.find('.mapping-section').removeClass('hide');
    }

    get_field_mapping() {
        let mapping = {};
        this.$content.find('.mapping-table select').each((i, select) => {
            let fieldname = $(select).val();
            if (fieldname) {
                mapping[i] = fieldname;
            }
        });
        return mapping;
    }

    validate_mapping() {
        if (!this.doctype) {
            frappe.throw('Veuillez sélectionner ou détecter un type de document');
            return false;
        }

        let mapping = this.get_field_mapping();
        let required_fields = this.doctype_fields.filter(df => df.reqd).map(df => df.fieldname);
        
        let mapped_fields = Object.values(mapping);
        let missing_required = required_fields.filter(f => !mapped_fields.includes(f));
        
        if (missing_required.length) {
            frappe.throw(`Champs obligatoires manquants : ${missing_required.join(', ')}`);
            return false;
        }
        
        return true;
    }

    start_import() {
        if (!this.file_url) {
            frappe.throw('Veuillez sélectionner un fichier CSV');
            return;
        }

        if (!this.validate_mapping()) return;

        frappe.call({
            method: 'erpnext.importcsv.page.import.import.import_csv_data',
            args: {
                file_content: this.file_url,
                doctype: this.doctype,
                submit: this.submit_after_import || false,
                auto_detect: this.$content.find('input[name="doctype-mode"]:checked').val() === 'auto'
            },
            callback: (r) => {
                if (r.message) {
                    this.show_import_status(r.message);
                }
            }
        });
    }

    show_import_status(result) {
        let $status = this.$content.find('.import-status');
        let html = '';
        
        if (result.status === 'success') {
            html = `
                <div class="status-message status-success">
                    ${result.message}
                </div>
            `;
            
            if (result.details) {
                if (result.details.doctype_used) {
                    html += `
                        <div class="alert alert-info">
                            Type de document utilisé : ${result.details.doctype_used}
                        </div>
                    `;
                }

                if (result.details.success.length) {
                    html += `
                        <div class="success-details">
                            <h5>Importés avec succès :</h5>
                            <ul>
                                ${result.details.success.map(s => 
                                    `<li>Ligne ${s.row}: ${s.name}</li>`
                                ).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                if (result.details.errors.length) {
                    html += `
                        <div class="error-details">
                            <h5>Erreurs :</h5>
                            <ul>
                                ${result.details.errors.map(e => 
                                    `<li>Ligne ${e.row}: ${e.error}</li>`
                                ).join('')}
                            </ul>
                        </div>
                    `;
                }
            }
        } else {
            html = `
                <div class="status-message status-error">
                    ${result.message}
                </div>
            `;
        }
        
        $status.html(html);
    }
}