// Namespace específico para a subpasta Diario
MinhaArea.Diario = {
    dadosAtuais: [],

    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;
        
        // Loader na tabela
        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12"><i class="fas fa-spinner fa-spin"></i> Carregando detalhamento...</td></tr>';

        // 1. Configurações de Filtro
        if (!MinhaArea.dataAtual) MinhaArea.dataAtual = new Date();
        const periodo = MinhaArea.getPeriodo();
        let uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;
        
        // Verifica permissões para botão de gestora
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        if (['GESTORA', 'AUDITORA'].includes(funcao) || MinhaArea.user.id == 1000) {
            this.renderizarBotaoGestora();
        }

        try {
            // 2. Busca Dados (Incluindo as novas colunas)
            let query = MinhaArea.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            // Se não for visão geral, filtra pelo usuário
            if (uid !== 'todos') query = query.eq('usuario_id', uid);

            const { data: producao, error } = await query;
            if (error) throw error;

            // 3. Busca Metas (para cálculo de eficiência)
            let metas = [];
            if (uid !== 'todos') {
                const { data: m } = await MinhaArea.supabase.from('metas').select('*').eq('usuario_id', uid);
                metas = m || [];
            }

            // 4. Busca Dados do Time (para Comparativo)
            // Agrupamos apenas quantidade para não pesar a query
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, data_referencia, usuario_id')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // PROCESSAMENTO DOS DADOS
            this.dadosAtuais = producao.map(item => {
                // Define Meta do dia (Prioridade: Meta Diaria na tabela > Meta Configurada > Padrão 650)
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
                    fator: Number(item.fator ?? 1) // Operador de coalescência nula
                };
            });

            // Média do Time (Agrupado por Dia/Pessoa para não distorcer com detalhamento)
            let mediaTime = 0;
            if (producaoTime && producaoTime.length) {
                const agrupado = {};
                producaoTime.forEach(p => {
                    const k = `${p.usuario_id}_${p.data_referencia}`;
                    if(!agrupado[k]) agrupado[k] = 0;
                    agrupado[k] += (Number(p.quantidade) || 0);
                });
                const valores = Object.values(agrupado);
                mediaTime = valores.length ? Math.round(valores.reduce((a,b)=>a+b,0) / valores.length) : 0;
            }

            this.atualizarKPIs(this.dadosAtuais, mediaTime, uid);
            this.atualizarTabelaDiaria(this.dadosAtuais, uid);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-4">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime, uid) {
        // LÓGICA DE AGRUPAMENTO:
        // Como agora temos múltiplas linhas por dia (detalhamento), precisamos somar a produção
        // mas considerar a meta apenas UMA VEZ por dia trabalhado.
        
        const diasTrabalhados = {}; // Chave: data_referencia
        let totalProduzido = 0;

        dados.forEach(d => {
            totalProduzido += d.quantidade;
            
            if (!diasTrabalhados[d.data_referencia]) {
                diasTrabalhados[d.data_referencia] = {
                    meta: d.meta,
                    fator: d.fator,
                    realizadoNoDia: 0
                };
            }
            diasTrabalhados[d.data_referencia].realizadoNoDia += d.quantidade;
        });

        // Calcula eficiência baseada na soma das metas dos dias trabalhados
        let metaAcumulada = 0;
        let diasCount = 0;

        Object.values(diasTrabalhados).forEach(dia => {
            if (dia.fator > 0) {
                metaAcumulada += (dia.meta * dia.fator);
                diasCount++;
            }
        });

        const eficiencia = metaAcumulada > 0 ? Math.round((totalProduzido / metaAcumulada) * 100) : 0;
        const mediaDiaria = diasCount > 0 ? Math.round(totalProduzido / diasCount) : 0;

        // Atualiza Cards na Tela
        this.setTxt('kpi-total', totalProduzido.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(metaAcumulada).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${eficiencia}%`);
        this.setTxt('kpi-media-real', mediaDiaria.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', `${diasCount}`);

        // Atualiza Barra e Status
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(eficiencia, 100)}%`;
            bar.className = eficiencia >= 100 ? "h-full bg-emerald-500 rounded-full" : (eficiencia >= 85 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        const statusTxt = document.getElementById('kpi-status-text');
        const icon = document.getElementById('icon-status');
        if (statusTxt && icon) {
             if(eficiencia >= 100) {
                statusTxt.innerHTML = "<span class='text-emerald-600'>Excelente!</span>";
                icon.className = "fas fa-star text-emerald-500";
            } else if(eficiencia >= 85) {
                statusTxt.innerHTML = "<span class='text-blue-600'>Na Meta.</span>";
                icon.className = "fas fa-thumbs-up text-blue-500";
            } else {
                statusTxt.innerHTML = "<span class='text-rose-600'>Abaixo.</span>";
                icon.className = "fas fa-thumbs-down text-rose-500";
            }
        }
    },

    atualizarTabelaDiaria: function(dados, uid) {
        const tbody = document.getElementById('tabela-diario');
        // Reconstrói o cabeçalho para incluir as colunas novas
        const thead = document.querySelector('#tabela-diario').parentElement.querySelector('thead tr');
        if(thead) {
            thead.innerHTML = `
                <th class="px-4 py-3 text-left">Data</th>
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
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12 text-slate-400">Nenhum registro encontrado no período.</td></tr>'; 
            return; 
        }

        let html = '';
        dados.forEach(item => {
            // Formata Data e Hora (End Time)
            let dataFmt = item.data_referencia.split('-').reverse().slice(0,2).join('/');
            if (item.hora) dataFmt += ` <span class="text-[10px] text-slate-400 block">${item.hora}</span>`;

            // Formata Status (Cores)
            let statusBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold border">${item.status || '-'}</span>`;
            const st = (item.status || '').toLowerCase();
            if (st.includes('ok')) statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold border">OK</span>`;
            else if (st.includes('nok') || st.includes('rev')) statusBadge = `<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-[10px] font-bold border">${item.status}</span>`;
            else if (st.includes('just')) statusBadge = `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold border">JUST</span>`;

            // Tratamento de valores nulos
            const empresa = item.empresa || '-';
            const nomeAssistente = item.usuarios?.nome || '-';
            const obs = item.observacao || '-';
            const nok = item.nok || '-';
            const assertividade = item.assertividade || '-';
            const auditora = item.auditora || '-';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition text-xs">
                <td class="px-4 py-3 font-bold text-slate-600 whitespace-nowrap">${dataFmt}</td>
                <td class="px-4 py-3 text-slate-600 font-semibold">${empresa}</td>
                <td class="px-4 py-3 text-slate-500">${nomeAssistente}</td>
                <td class="px-4 py-3 text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-slate-600 max-w-xs break-words leading-tight" title="${obs}">${obs}</td>
                <td class="px-4 py-3 text-center text-rose-600 font-bold">${nok}</td>
                <td class="px-4 py-3 text-center text-blue-600 font-mono font-bold">${assertividade}</td>
                <td class="px-4 py-3 text-slate-500 italic">${auditora}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },

    // Funções placeholder para manter compatibilidade se chamadas externamente
    verificarAcessoHoje: function() {},
    renderizarBotaoGestora: function() {}
};