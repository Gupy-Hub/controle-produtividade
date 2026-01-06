Produtividade.Consolidado = {
    init: function() { this.carregar(); },

    togglePeriodo: function() { this.carregar(); },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
        
        try {
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .order('data_referencia');
                
            if (error) throw error;

            if (!data || data.length === 0) {
                this.zerarCards();
                if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Sem dados.</td></tr>';
                return;
            }

            const mapUser = {};
            const mapDias = {};
            let totalGeral = 0;

            data.forEach(d => {
                const uid = d.usuario_id;
                const nome = d.usuarios ? d.usuarios.nome : 'Desconhecido';
                
                if (!mapUser[uid]) mapUser[uid] = { nome: nome, total: 0, dias: 0 };
                
                const qtd = d.quantidade || 0;
                const fator = d.fator_multiplicador === null ? 1 : d.fator_multiplicador;
                
                mapUser[uid].total += qtd;
                if(fator > 0) mapUser[uid].dias += fator;

                totalGeral += qtd;
                const dataRef = d.data_referencia;
                if(!mapDias[dataRef]) mapDias[dataRef] = 0;
                mapDias[dataRef] += qtd;
            });

            // KPIs
            const diasUnicos = Object.keys(mapDias).length;
            const totalAssist = Object.keys(mapUser).length;
            const mediaGeral = (totalAssist > 0 && diasUnicos > 0) ? Math.round(totalGeral / totalAssist / diasUnicos) : 0;
            
            let melhorDiaVal = 0, melhorDiaData = '-';
            for (const [dia, val] of Object.entries(mapDias)) {
                if (val > melhorDiaVal) { melhorDiaVal = val; melhorDiaData = dia.split('-').reverse().join('/'); }
            }

            document.getElementById('cons-kpi-total').innerText = totalGeral.toLocaleString('pt-BR');
            document.getElementById('cons-kpi-media').innerText = mediaGeral.toLocaleString('pt-BR');
            document.getElementById('cons-kpi-dias').innerText = diasUnicos;
            document.getElementById('cons-kpi-melhor').innerText = `${melhorDiaData} (${melhorDiaVal})`;

            // Tabela
            let html = '';
            Object.values(mapUser).sort((a,b) => b.total - a.total).forEach(u => {
                const media = u.dias > 0 ? Math.round(u.total / u.dias) : 0;
                html += `<tr class="border-b hover:bg-slate-50 text-xs">
                    <td class="px-6 py-3 font-bold">${u.nome}</td>
                    <td class="px-6 py-3 text-center text-blue-700 font-bold">${u.total.toLocaleString('pt-BR')}</td>
                    <td class="px-6 py-3 text-center">${u.dias.toFixed(1)}</td>
                    <td class="px-6 py-3 text-center">${media.toLocaleString('pt-BR')}</td>
                </tr>`;
            });
            if(tbody) tbody.innerHTML = html;

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-red-500 text-center">${e.message}</td></tr>`;
        }
    },
    
    zerarCards: function() {
        ['cons-kpi-total', 'cons-kpi-media', 'cons-kpi-dias', 'cons-kpi-melhor'].forEach(id => {
            const el = document.getElementById(id); if(el) el.innerText = '--';
        });
    }
};