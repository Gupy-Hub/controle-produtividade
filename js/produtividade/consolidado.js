Produtividade.Consolidado = {
    init: function() {
        this.carregar();
    },

    togglePeriodo: function() {
        const tipo = document.getElementById('cons-period-type').value;
        const qSelect = document.getElementById('cons-select-quarter');
        const sSelect = document.getElementById('cons-select-semester');
        
        if(qSelect) qSelect.classList.add('hidden');
        if(sSelect) sSelect.classList.add('hidden');
        
        if (tipo.includes('trimestre') && qSelect) qSelect.classList.remove('hidden');
        if (tipo.includes('semestre') && sSelect) sSelect.classList.remove('hidden');
        
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
        
        try {
            // Busca dados ordenados
            const { data, error } = await Produtividade.supabase
                .from('producao')
                .select('*, usuarios(nome)')
                .order('data_referencia', { ascending: true });
                
            if (error) throw error;

            if (!data || data.length === 0) {
                this.zerarCards();
                if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Sem dados para exibir.</td></tr>';
                return;
            }

            // Agrupamento
            const mapUser = {};
            const mapDias = {};
            let totalGeral = 0;

            data.forEach(d => {
                const uid = d.usuario_id;
                // Proteção: Se usuário foi excluído, d.usuarios será null. Usamos fallback.
                const nomeUser = d.usuarios && d.usuarios.nome ? d.usuarios.nome : `(ID: ${uid})`;

                if (!mapUser[uid]) mapUser[uid] = { nome: nomeUser, total: 0, dias: 0 };
                
                // Garante que são números
                const qtd = Number(d.quantidade) || 0;
                const fator = Number(d.fator_multiplicador) || 0; // Se null, vira 0 (não conta dia se não tiver fator)

                mapUser[uid].total += qtd;
                // Considera dia trabalhado se fator for null (padrão 1) ou maior que 0
                const diaContabil = d.fator_multiplicador === null ? 1 : (fator > 0 ? fator : 0); 
                mapUser[uid].dias += diaContabil;

                totalGeral += qtd;
                
                const dataRef = d.data_referencia;
                if(!mapDias[dataRef]) mapDias[dataRef] = 0;
                mapDias[dataRef] += qtd;
            });

            // --- CÁLCULO DOS CARDS (KPIs) ---
            const diasUnicos = Object.keys(mapDias).length;
            const totalAssistentes = Object.keys(mapUser).length;
            const mediaGeral = (totalAssistentes > 0 && diasUnicos > 0) 
                ? Math.round(totalGeral / totalAssistentes / diasUnicos) 
                : 0;
            
            // Melhor Dia
            let melhorDiaVal = 0;
            let melhorDiaData = '-';
            for (const [dia, val] of Object.entries(mapDias)) {
                if (val > melhorDiaVal) { 
                    melhorDiaVal = val; 
                    melhorDiaData = dia.split('-').reverse().join('/'); 
                }
            }

            // Atualiza DOM dos Cards com segurança
            const elTotal = document.getElementById('cons-kpi-total');
            const elMedia = document.getElementById('cons-kpi-media');
            const elDias = document.getElementById('cons-kpi-dias');
            const elMelhor = document.getElementById('cons-kpi-melhor');

            if(elTotal) elTotal.innerText = totalGeral.toLocaleString('pt-BR');
            if(elMedia) elMedia.innerText = mediaGeral.toLocaleString('pt-BR');
            if(elDias) elDias.innerText = diasUnicos;
            if(elMelhor) elMelhor.innerText = melhorDiaVal > 0 ? `${melhorDiaData} (${melhorDiaVal})` : '-';

            // --- RENDERIZA TABELA ---
            if(thead) {
                thead.innerHTML = `<tr class="bg-slate-50 text-slate-500 text-xs uppercase">
                    <th class="px-6 py-3">Assistente</th>
                    <th class="px-6 py-3 text-center">Total Produzido</th>
                    <th class="px-6 py-3 text-center">Dias Trab.</th>
                    <th class="px-6 py-3 text-center">Média Diária</th>
                </tr>`;
            }

            let bodyHtml = '';
            // Ordena por produção total decrescente
            Object.values(mapUser)
                .sort((a,b) => b.total - a.total)
                .forEach(u => {
                    const dias = u.dias || 1; // Evita divisão por zero
                    const media = Math.round(u.total / dias);
                    
                    bodyHtml += `<tr class="border-b border-slate-50 hover:bg-slate-50">
                        <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                        <td class="px-6 py-3 text-center text-blue-700 font-bold">${u.total.toLocaleString('pt-BR')}</td>
                        <td class="px-6 py-3 text-center">${u.dias.toFixed(1)}</td>
                        <td class="px-6 py-3 text-center">${media.toLocaleString('pt-BR')}</td>
                    </tr>`;
                });
            
            if(tbody) tbody.innerHTML = bodyHtml || '<tr><td colspan="4" class="text-center py-4">Sem dados.</td></tr>';

        } catch (e) {
            console.error("Erro Consolidado:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    zerarCards: function() {
        ['cons-kpi-total', 'cons-kpi-media', 'cons-kpi-dias', 'cons-kpi-melhor'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = '--';
        });
    }
};