MinhaArea.Diario = {
    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        const tbody = document.getElementById('tabela-extrato');
        
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</td></tr>';

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: true }); // Ordem cronológica

            if (error) throw error;

            // Variáveis de Totais
            let tFator = 0, tFifo = 0, tGt = 0, tGp = 0, tProd = 0, tMeta = 0;
            let diasTrabalhados = 0;

            tbody.innerHTML = '';

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-400 italic">Nenhum registro encontrado neste período.</td></tr>';
            }

            data.forEach(r => {
                const [ano, mes, dia] = r.data_referencia.split('-');
                
                const qtd = Number(r.quantidade) || 0;
                const fator = Number(r.fator) || 0;
                const metaDia = 650 * fator;
                const pct = metaDia > 0 ? (qtd / metaDia) * 100 : 0;

                // Acumula Totais
                tFator += fator;
                tFifo += (Number(r.fifo) || 0);
                tGt += (Number(r.gradual_total) || 0);
                tGp += (Number(r.gradual_parcial) || 0);
                tProd += qtd;
                tMeta += metaDia;
                if (fator > 0) diasTrabalhados++;

                // Visual
                let classPct = pct >= 100 ? "text-emerald-600 font-black" : "text-amber-600 font-bold";
                let bgFator = fator == 1 ? "" : "bg-amber-50 text-amber-700 font-bold";

                const tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                        <td class="px-6 py-2 font-bold text-slate-700">${dia}/${mes}/${ano}</td>
                        <td class="px-6 py-2 text-center ${bgFator}">${fator}</td>
                        <td class="px-6 py-2 text-center">${r.fifo || 0}</td>
                        <td class="px-6 py-2 text-center">${r.gradual_total || 0}</td>
                        <td class="px-6 py-2 text-center">${r.gradual_parcial || 0}</td>
                        <td class="px-6 py-2 text-center font-bold text-blue-700 bg-blue-50/30">${qtd}</td>
                        <td class="px-6 py-2 text-center text-slate-400 text-xs">${Math.round(metaDia)}</td>
                        <td class="px-6 py-2 text-center ${classPct}">${Math.round(pct)}%</td>
                        <td class="px-6 py-2 text-xs text-slate-400 italic truncate max-w-[200px]" title="${r.justificativa || ''}">${r.justificativa || '-'}</td>
                    </tr>
                `;
                tbody.innerHTML += tr;
            });

            // Atualiza Rodapé da Tabela
            const setFoot = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
            setFoot('footer-fator', tFator);
            setFoot('footer-fifo', tFifo);
            setFoot('footer-gt', tGt);
            setFoot('footer-gp', tGp);
            setFoot('footer-prod', tProd.toLocaleString());
            setFoot('footer-meta', Math.round(tMeta).toLocaleString());
            const pctGeral = tMeta > 0 ? Math.round((tProd / tMeta) * 100) : 0;
            setFoot('footer-pct', pctGeral + '%');

            // Atualiza Cards de KPI (Topo)
            this.setTxt('kpi-total', tProd.toLocaleString());
            this.setTxt('kpi-pct', pctGeral + '%');
            this.setTxt('kpi-dias', diasTrabalhados);
            const media = diasTrabalhados > 0 ? Math.round(tProd / diasTrabalhados) : 0;
            this.setTxt('kpi-media', media.toLocaleString());

            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = Math.min(pctGeral, 100) + '%';
                bar.className = pctGeral >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
            }

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-red-400 text-xs">Erro ao carregar dados.</td></tr>';
        }
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};