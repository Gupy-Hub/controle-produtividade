/**
 * ARQUIVO: js/minha_area/geral.js
 * CORREÇÃO: Justificativas e Padronização de Cards
 */
MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-extrato');
        
        if (!uid) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i></td></tr>';

        try {
            // 1. Busca Produção garantindo o campo 'justificativa'
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('data_referencia, fator, fifo, gradual_total, gradual_parcial, quantidade, justificativa')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Meta Diária
            const [anoStr, mesStr] = inicio.split('-');
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta')
                .eq('usuario_id', uid)
                .eq('mes', parseInt(mesStr))
                .eq('ano', parseInt(anoStr))
                .maybeSingle();

            const metaDiariaBase = metaData ? metaData.meta : 650;

            // 3. Renderização e Cálculos
            let totalProd = 0, totalMeta = 0, diasComProducao = 0, somaFatores = 0;
            tbody.innerHTML = '';

            data.forEach(item => {
                const qtd = Number(item.quantidade || 0);
                const fator = Number(item.fator || 0);
                const metaDia = Math.round(metaDiariaBase * fator);
                
                totalProd += qtd;
                totalMeta += metaDia;
                somaFatores += fator;
                if(fator > 0) diasComProducao++;

                const atingimento = metaDia > 0 ? (qtd / metaDia) * 100 : 0;
                const corAting = atingimento >= 100 ? 'text-emerald-600' : (atingimento >= 80 ? 'text-amber-600' : 'text-rose-600');
                
                // Formatação de Data
                const dataFmt = item.data_referencia.split('-').reverse().join('/');

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-200 text-xs">
                        <td class="px-3 py-2 font-bold text-slate-700">${dataFmt}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${fator}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.fifo || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_total || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_parcial || 0}</td>
                        <td class="px-2 py-2 text-center font-black text-blue-700 bg-blue-50/30">${qtd}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${metaDia}</td>
                        <td class="px-2 py-2 text-center font-bold ${corAting}">${atingimento.toFixed(2)}%</td>
                        <td class="px-3 py-2 text-slate-600 italic">
                            ${item.justificativa || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>`;
            });

            // Atualização de KPIs
            const percGeral = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 0;
            this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMeta.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', percGeral.toFixed(2) + '%');
            this.setTxt('kpi-dias', diasComProducao);
            this.setTxt('kpi-media', diasComProducao > 0 ? Math.round(totalProd / diasComProducao) : 0);
            this.setTxt('kpi-meta-dia', metaDiariaBase);
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteisMes(inicio, fim));

            const bar = document.getElementById('bar-progress');
            if(bar) bar.style.width = `${Math.min(percGeral, 100)}%`;

        } catch (err) {
            console.error("Erro ao carregar Minha Área:", err);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro na conexão.</td></tr>';
        }
    },

    // Mantém as funções setTxt, setStatus e calcularDiasUteisMes conforme arquivos anteriores
    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    
    calcularDiasUteisMes: function(inicio, fim) {
        let count = 0;
        const cur = new Date(inicio + 'T12:00:00');
        const end = new Date(fim + 'T12:00:00');
        while (cur <= end) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    }
};