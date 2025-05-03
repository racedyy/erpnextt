frappe.pages['resetdata'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Data Reset',
		single_column: true
	});

	// Liste des doctypes à réinitialiser
	const DOCTYPES_TO_RESET = [
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
	];

	// Créer la section pour afficher les tables
	let $content = $(`
		<div class="reset-data-page">
			<div class="stats-section">
				<div class="stats-box">
					<div class="stat">
						<div class="stat-label">Tables à réinitialiser</div>
						<div class="stat-value">${DOCTYPES_TO_RESET.length}</div>
					</div>
				</div>
			</div>

			<div class="tables-section">
				<div class="section-title">Tables métier à réinitialiser</div>
				<div class="table-list"></div>
			</div>

			<div class="log-section hide">
				<div class="section-title">Journal de réinitialisation</div>
				<div class="log-content"></div>
			</div>
		</div>
	`).appendTo(page.main);

	// Fonction pour obtenir le nombre d'enregistrements dans une table
	const getTableCount = async (doctype) => {
		try {
			const result = await frappe.call({
				method: 'erpnext.datareset.page.resetdata.resetdata.get_table_count',
				args: {
					doctype: doctype
				}
			});
			return result.message || 0;
		} catch (e) {
			console.error(`Erreur lors du comptage de ${doctype}:`, e);
			return 0;
		}
	};

	// Fonction pour vérifier si une table existe
	const checkTableExists = async (doctype) => {
		try {
			const result = await frappe.call({
				method: 'erpnext.datareset.page.resetdata.resetdata.check_table_exists',
				args: {
					doctype: doctype
				}
			});
			return result.message || false;
		} catch (e) {
			console.error(`Erreur lors de la vérification de ${doctype}:`, e);
			return false;
		}
	};

	// Fonction pour mettre à jour l'affichage des tables
	const updateTableList = async () => {
		const tableItems = await Promise.all(DOCTYPES_TO_RESET.map(async (doctype) => {
			const exists = await checkTableExists(doctype);
			const count = exists ? await getTableCount(doctype) : 0;
			const status = exists ? '' : 'warning';
			const statusMessage = exists ? '' : '⚠️ Table non installée';
			
			return `
				<div class="table-item ${status}" data-doctype="${doctype}">
					<div class="table-info">
						<span class="table-name">${doctype}</span>
						<span class="record-count">${exists ? `${count} enregistrements` : 'Non installée'}</span>
					</div>
					<div class="status-indicator">${statusMessage}</div>
				</div>
			`;
		}));

		$content.find('.table-list').html(tableItems.join(''));
	};

	// Fonction pour mettre à jour le statut d'une table
	const updateTableStatus = (doctype, status, message) => {
		const $item = $content.find(`.table-item[data-doctype="${doctype}"]`);
		$item.find('.status-indicator').html(`
			<span class="status-icon ${status}">${status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌'}</span>
			<span class="status-message">${message}</span>
		`);
	};

	// Fonction de réinitialisation
	const resetData = async () => {
		try {
			// Afficher la section de logs
			$content.find('.log-section').removeClass('hide');
			$content.find('.log-content').html('');

			// Appeler la fonction de réinitialisation
			const result = await frappe.call({
				method: 'erpnext.datareset.page.resetdata.resetdata.reset_all_data',
				freeze: true,
				freeze_message: 'Réinitialisation des données en cours...'
			});

			// Traiter les résultats
			if (result.message && result.message.results) {
				result.message.results.forEach(r => {
					updateTableStatus(r.doctype, r.status, r.message);
					$content.find('.log-content').append(`
						<div class="log-entry ${r.status}">
							${r.message}
						</div>
					`);
				});
			}

			// Mettre à jour les compteurs
			await updateTableList();

			frappe.show_alert({
				message: result.message.message,
				indicator: 'green'
			});

		} catch (error) {
			frappe.show_alert({
				message: `Erreur lors de la réinitialisation: ${error.message}`,
				indicator: 'red'
			});
		}
	};

	// Ajouter le bouton de réinitialisation
	page.set_primary_action('Réinitialiser les données', () => {
		frappe.confirm(
			'Cette action va supprimer toutes les données des tables métier sélectionnées. Cette action est irréversible. Êtes-vous sûr de vouloir continuer ?',
			() => resetData()
		);
	});

	// Ajouter le style CSS
	frappe.dom.set_style(`
		.reset-data-page {
			padding: 15px;
		}
		.section-title {
			font-size: 1.2em;
			font-weight: bold;
			margin-bottom: 15px;
			color: var(--text-color);
		}
		.stats-section {
			margin-bottom: 30px;
		}
		.stats-box {
			background: var(--bg-light-gray);
			padding: 15px;
			border-radius: 8px;
			text-align: center;
		}
		.stat-label {
			font-size: 0.9em;
			color: var(--text-muted);
		}
		.stat-value {
			font-size: 2em;
			font-weight: bold;
			color: var(--text-color);
		}
		.table-list {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
			gap: 10px;
		}
		.table-item {
			background: white;
			padding: 15px;
			border: 1px solid var(--border-color);
			border-radius: 6px;
		}
		.table-item.warning {
			border-left: 4px solid var(--yellow-500);
			background: var(--yellow-50);
		}
		.table-item.error {
			border-left: 4px solid var(--red-500);
			background: var(--red-50);
		}
		.table-info {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}
		.table-name {
			font-weight: bold;
		}
		.record-count {
			color: var(--text-muted);
			font-size: 0.9em;
		}
		.status-indicator {
			font-size: 0.9em;
		}
		.status-icon {
			margin-right: 5px;
		}
		.status-message {
			color: var(--text-muted);
		}
		.log-section {
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid var(--border-color);
		}
		.log-section.hide {
			display: none;
		}
		.log-content {
			background: var(--bg-light-gray);
			padding: 15px;
			border-radius: 8px;
			max-height: 300px;
			overflow-y: auto;
		}
		.log-entry {
			padding: 5px 0;
			border-bottom: 1px solid var(--border-color);
		}
		.log-entry:last-child {
			border-bottom: none;
		}
		.log-entry.success {
			color: var(--green-600);
		}
		.log-entry.warning {
			color: var(--yellow-600);
		}
		.log-entry.error {
			color: var(--red-600);
		}
	`);

	// Charger la liste des tables initiale
	updateTableList();
}