MinhaArea.Diario = {
    dadosAtuais: [],

    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;
        
        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        if (!MinhaArea.dataAtual) MinhaArea.dataAtual = new Date();
        const periodo = MinhaArea.getPeriodo();
        let uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;
        
        // Verifica permissão Admin
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        if (['GESTORA', 'AUDITORA'].includes(funcao) || MinhaArea.user.id == 1000) {
            this.renderizarBotaoGestora();
        }

        try {
            // Busca dados
            let query = MinhaArea.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false })
                .order('created_at', { ascending: false }); // Ordem de inserção para desempatar

            if (uid !== 'todos') query = query.eq('usuario_id', uid);

            const { data: producao, error } = await query;
            if (error) throw error;

            // Busca Metas
            let metas = [];
            if (uid !== 'todos') {
                const { data: m } = await MinhaArea.supabase.from('metas').select('*').eq('usuario_id', uid);
                metas = m || [];
            }

            // Processamento
            this.dadosAtuais = producao.map(item => {
                let metaBase = 650;
                if (item.meta_diaria > 0) metaBase = Number(item.meta_diaria);
                else if (metas.length) {
                    const m = metas.find(mt => mt.data_inicio <= item.data_referencia);
                    if (m) metaBase = Number(m.valor_meta);
                }
                return {
                    ...item,
                    quantidade: Number(item.quantidade) || 0,
                    meta: metaBase,
                    fator: Number(item.fator ?? 1)
                };
            });

            // KPI Dummy para evitar erro se não tiver dados de time
            const mediaTime = 0; 

            this.atualizarKPIs(this.dadosAtuais, mediaTime, uid);
            this.atualizarTabelaDiaria(this.dadosAtuais, uid, periodo);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime, uid) {
        // Agrupa por Dia para contar meta apenas uma vez
        const dias = {};
        let totalProd = 0;
        dados.forEach(d => {
            totalProd += d.quantidade;
            if(!dias[d.data_referencia]) dias[d.data_referencia] = { meta: d.meta, fator: d.fator };
        });

        let metaTotal = 0;
        let diasTrab = 0;
        Object.values(dias).forEach(d => {
            if(d.fator > 0) { metaTotal += (d.meta * d.fator); diasTrab++; }
        });

        const pct = metaTotal > 0 ? Math.round((totalProd/metaTotal)*100) : 0;
        const media = diasTrab > 0 ? Math.round(totalProd/diasTrab) : 0;

        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(metaTotal).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${pct}%`);
        this.setTxt('kpi-media-real', media.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', diasTrab);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(pct, 100)}%`;
            bar.className = pct >= 100 ? "h-full bg-emerald-500 rounded-full" : (pct >= 85 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }
    },

    atualizarTabelaDiaria: function(dados, uid, periodo) {
        const tbody = document.getElementById('tabela-diario');
        
        // Renderiza Cabeçalho com as Colunas Solicitadas
        const thead = document.querySelector('#tabela-diario').closest('table').querySelector('thead tr');
        if(thead) {
            thead.innerHTML = `
                <th class="px-4 py-3 text-left">Data / Hora</th>
                <th class="px-4 py-3 text-left">Empresa (ID)</th>
                <th class="px-4 py-3 text-left">Assistente</th>
                <th class="px-4 py-3 text-center">Status</th>
                <th class="px-4 py-3 text-left">Obs / Apontamentos</th>
                <th class="px-4 py-3 text-center">NOK</th>
                <th class="px-4 py-3 text-center">% Assert.</th>
                <th class="px-4 py-3 text-left">Auditora</th>
            `;
        }

        if (!dados.length) { 
            // Mensagem de ajuda se não tiver dados
            const dtIni = periodo.inicio.split('-').reverse().join('/');
            const dtFim = periodo.fim.split('-').reverse().join('/');
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-12 text-slate-400">
                        <div class="flex flex-col items-center gap-2">
                            <i class="fas fa-search text-2xl mb-2 opacity-50"></i>
                            <span class="font-bold">Nenhum registro encontrado.</span>
                            <span class="text-xs">Filtro atual: ${dtIni} até ${dtFim}</span>
                            <span class="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded mt-2">Dica: Verifique se o filtro de data (no topo da página) engloba a data do arquivo importado.</span>
                        </div>
                    </td>
                </tr>`; 
            return; 
        }

        let html = '';
        dados.forEach(item => {
            // Data e Hora
            let dataFmt = item.data_referencia.split('-').reverse().slice(0,2).join('/');
            if (item.hora) dataFmt += ` <span class="text-[10px] text-slate-400 block font-normal">${item.hora}</span>`;

            // Status Colorido
            const statusRaw = (item.status || '').toUpperCase();
            let statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold border">${item.status || '-'}</span>`;
            if (statusRaw.includes('OK')) statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold border">OK</span>`;
            else if (statusRaw.includes('NOK') || statusRaw.includes('REV')) statusBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-[10px] font-bold border">${item.status}</span>`;
            else if (statusRaw.includes('JUST')) statusBadge = `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold border">JUST</span>`;

            // Empresa (Tenta pegar valor importado, ou fallback)
            const empresaDisplay = item.empresa || '-';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition text-xs">
                <td class="px-4 py-3 font-bold text-slate-600 whitespace-nowrap">${dataFmt}</td>
                <td class="px-4 py-3 text-slate-700 font-semibold">${empresaDisplay}</td>
                <td class="px-4 py-3 text-slate-500">${item.usuarios?.nome || '-'}</td>
                <td class="px-4 py-3 text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-slate-600 max-w-xs break-words leading-tight" title="${item.observacao || ''}">${item.observacao || '-'}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold">${item.nok || '-'}</td>
                <td class="px-4 py-3 text-center text-blue-600 font-mono font-bold">${item.assertividade || '-'}</td>
                <td class="px-4 py-3 text-slate-500 italic">${item.auditora || '-'}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; },
    verificarAcessoHoje: function() {},
    renderizarBotaoGestora: function() {}
};