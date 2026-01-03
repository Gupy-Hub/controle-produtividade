const MA_Assertividade = {
    processarExcel: function(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});

            this.renderizarTabela(json);
        };
        reader.readAsArrayBuffer(file);
    },

    renderizarTabela: function(rows) {
        const tbody = document.getElementById('tabela-assertividade');
        if (!rows || rows.length <= 1) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-red-500">Arquivo vazio ou formato inválido.</td></tr>'; 
            return; 
        }

        let html = '';
        
        // Pula o cabeçalho (i=1)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let dataVal = row[0];
            if (typeof dataVal === 'number') {
                // Conversão Excel Date
                const dateInfo = new Date((dataVal - (25567 + 2))*86400*1000); 
                dataVal = dateInfo.toLocaleDateString();
            }

            const desc = row[1] || '-';
            const erros = row[2] || 0;
            const nota = row[3]; 

            let statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">OK</span>';
            if (erros > 0 || (typeof nota === 'number' && nota < 100)) {
                statusBadge = '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">Atenção</span>';
            }

            html += `<tr class="hover:bg-slate-50 border-b border-slate-50">
                        <td class="px-6 py-3 font-bold text-slate-600">${dataVal || '-'}</td>
                        <td class="px-6 py-3 text-slate-600">${desc}</td>
                        <td class="px-6 py-3 text-center text-slate-800 font-bold">${erros}</td>
                        <td class="px-6 py-3 text-center font-black text-blue-600">${nota || '-'}</td>
                        <td class="px-6 py-3 text-center">${statusBadge}</td>
                     </tr>`;
        }
        tbody.innerHTML = html;
    }
};