MinhaArea.Assertividade = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo();
        const tbody = document.getElementById('tabela-audit');
        
        if (!uid) {
            if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-20 text-slate-400">Selecione uma colaboradora</td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-20 text-slate-400"><i class="fas fa-spinner fa-spin"></i> Carregando auditoria...</td></tr>';

        try {
            // 1. Busca Registros de Auditoria (Lista Detalhada)
            const { data: auditData, error } = await Sistema.supabase
                .from('assertividade')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Produção Total do Período (Para calcular Impacto %)
            const { data: prodData } = await Sistema.supabase
                .from('producao')
                .select('quantidade')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim);

            const totalProducaoGeral = prodData ? prodData.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0) : 0;

            // 3. Processamento
            let totalAuditado = 0;
            let totalNOK = 0;

            if (tbody) tbody.innerHTML = '';

            auditData.forEach(item => {
                // Filtra status vazios ou brancos
                if (!item.status || item.status.trim() === '' || item.status === 'EM BRANCO' || item.status === 'EMPTY') return;

                totalAuditado++;
                const isNOK = item.status === 'NOK';
                if (isNOK) totalNOK++;

                // Renderiza Linha Detalhada
                const dateObj = new Date(item.data_referencia + 'T12:00:00');
                const dataFmt = dateObj.toLocaleDateString('pt-BR');
                
                let badgeClass = isNOK 
                    ? "bg-rose-100 text-rose-700 border-rose-200" 
                    : "bg-emerald-100 text-emerald-700 border-emerald-200";

                const tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs text-slate-600">
                        <td class="px-3 py-3 font-bold">${dataFmt}</td>
                        <td class="px-3 py-3 font-medium text-slate-700 truncate max-w-[200px]" title="${item.documento || ''}">${item.documento || '-'}</td>
                        <td class="px-2 py-3 text-center">
                            <span class="px-2 py-1 rounded text-[10px] font-bold border ${badgeClass}">${item.status}</span>
                        </td>
                        <td class="px-3 py-3 text-slate-500 italic max-w-[300px] break-words">
                            ${item.observacao || '-'}
                        </td>
                    </tr>
                `;
                if (tbody) tbody.innerHTML += tr;
            });

            if (totalAuditado === 0 && tbody) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center py-12 text-slate-400 italic">Nenhuma auditoria registrada neste período.</td></tr>';
            }

            // 4. Cálculos e KPIs
            const pctAssertividade = totalAuditado > 0 
                ? ((totalAuditado - totalNOK) / totalAuditado) * 100 
                : 100; // Se não tem auditoria, assume 100% ou 0% dependendo da regra. Vamos por 100% inicial.

            // Erro x Produtividade (NOK / Total Produzido)
            const pctImpacto = totalProducaoGeral > 0 
                ? (totalNOK / totalProducaoGeral) * 100 
                : 0;

            this.setTxt('kpi-audit-total', totalAuditado);
            this.setTxt('kpi-audit-nok', totalNOK);
            this.setTxt('kpi-audit-pct', pctAssertividade.toFixed(2) + '%');
            this.setTxt('kpi-audit-impacto', pctImpacto.toFixed(2) + '%');

            const bar = document.getElementById('bar-audit-progress');
            if(bar) {
                bar.style.width = `${pctAssertividade}%`;
                bar.className = pctAssertividade >= 98 ? "h-full bg-emerald-500 rounded-full" : (pctAssertividade >= 90 ? "h-full bg-amber-500 rounded-full" : "h-full bg-rose-500 rounded-full");
            }

        } catch (err) {
            console.error("Erro assertividade:", err);
            if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-rose-500">Erro ao carregar dados.</td></tr>';
        }
    },

    zerarKPIs: function() {
        this.setTxt('kpi-audit-total', '--');
        this.setTxt('kpi-audit-nok', '--');
        this.setTxt('kpi-audit-pct', '--%');
        this.setTxt('kpi-audit-impacto', '--%');
        const bar = document.getElementById('bar-audit-progress');
        if(bar) bar.style.width = '0%';
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
};