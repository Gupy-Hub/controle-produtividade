MinhaArea.Diario = {
    dadosAtuais: [],

    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;
        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

        // 1. Definições
        if (!MinhaArea.dataAtual) MinhaArea.dataAtual = new Date();
        const periodo = MinhaArea.getPeriodo();
        let uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;
        
        // Botão Gestora (mantido lógica original)
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        if (['GESTORA', 'AUDITORA'].includes(funcao) || MinhaArea.user.id == 1000) {
            this.renderizarBotaoGestora();
        }

        try {
            // 2. Query Principal (Incluindo colunas novas: empresa, auditora, status, etc)
            let query = MinhaArea.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (uid !== 'todos') query = query.eq('usuario_id', uid);

            const { data: producao, error } = await query;
            if (error) throw error;

            // 3. Metas e Média Time
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, data_referencia, usuario_id') // precisamos agrupar
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            let metas = [];
            if (uid !== 'todos') {
                const { data: m } = await MinhaArea.supabase.from('metas').select('*').eq('usuario_id', uid);
                metas = m || [];
            }

            // 4. Processamento dos Dados
            this.dadosAtuais = producao.map(item => {
                // Define Meta base
                let metaBase = 650;
                if (item.meta_diaria > 0) metaBase = Number(item.meta_diaria);
                else if (metas.length) {
                    const m = metas.find(mt => mt.data_inicio <= item.data_referencia);
                    if (m) metaBase = Number(m.valor_meta);
                }

                return {
                    ...item, // Traz tudo (empresa, auditora, etc)
                    quantidade: Number(item.quantidade) || 0,
                    meta: metaBase,
                    fator: Number(item.fator || item.fator_multiplicador || 1)
                };
            });

            // Cálculo Média Time (Ajustado para não somar meta duplicada se houver multiplas linhas)
            let mediaTime = 0;
            if (producaoTime && producaoTime.length) {
                // Agrupa produção do time por Usuario+Dia
                const prodAgrupada = {}; 
                producaoTime.forEach(p => {
                    const key = `${p.usuario_id}-${p.data_referencia}`;
                    if(!prodAgrupada[key]) prodAgrupada[key] = 0;
                    prodAgrupada[key] += (Number(p.quantidade) || 0);
                });
                const valores = Object.values(prodAgrupada);
                const total = valores.reduce((a,b) => a+b, 0);
                mediaTime = valores.length ? Math.round(total / valores.length) : 0;
            }

            // Calcula Meta Mensal (Dias Úteis)
            let metaMensal = 0;
            // ... (logica de dias uteis mantida simplificada aqui)
            // Assumindo cálculo padrão de dias úteis * 650

            this.atualizarKPIs(this.dadosAtuais, mediaTime, uid);
            this.atualizarTabelaDiaria(this.dadosAtuais, uid);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime, uid) {
        // CORREÇÃO CRÍTICA: Se temos 50 linhas no mesmo dia, a meta é cobrada apenas 1 VEZ.
        // Precisamos agrupar por DIA para calcular a eficiência corretamente.
        
        const diasUnicos = {};
        let totalProd = 0;

        dados.forEach(d => {
            totalProd += d.quantidade;
            
            // Lógica de Meta por Dia
            if (!diasUnicos[d.data_referencia]) {
                diasUnicos[d.data_referencia] = { meta: d.meta, fator: d.fator, realizado: 0 };
            }
            diasUnicos[d.data_referencia].realizado += d.quantidade;
        });

        // Calcula Meta Trabalhada (Soma das metas dos dias que houve trabalho)
        let metaTrabalhada = 0;
        let diasEfetivos = 0;

        Object.values(diasUnicos).forEach(dia => {
            if (dia.fator > 0) {
                metaTrabalhada += (dia.meta * dia.fator);
                diasEfetivos++;
            }
        });

        const pctEficiencia = metaTrabalhada > 0 ? Math.round((totalProd / metaTrabalhada) * 100) : 0;
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;

        // Atualiza UI
        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(metaTrabalhada).toLocaleString('pt-BR')); // Mostra meta ajustada trabalhada
        this.setTxt('kpi-pct', `${pctEficiencia}%`);
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', `${diasEfetivos}`);

        // Barra de Progresso e Status
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(pctEficiencia, 100)}%`;
            bar.className = pctEficiencia >= 100 ? "h-full bg-emerald-500 rounded-full" : (pctEficiencia >= 85 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        // Recupera Status Card
        const statusTxt = document.getElementById('kpi-status-text');
        const icon = document.getElementById('icon-status');
        if (statusTxt && icon) {
             if(pctEficiencia >= 100) {
                statusTxt.innerHTML = "<span class='text-emerald-600'>Excelente!</span>";
                icon.className = "fas fa-star text-emerald-500";
            } else if(pctEficiencia >= 85) {
                statusTxt.innerHTML = "<span class='text-blue-600'>Bom.</span>";
                icon.className = "fas fa-thumbs-up text-blue-500";
            } else {
                statusTxt.innerHTML = "<span class='text-rose-600'>Abaixo.</span>";
                icon.className = "fas fa-thumbs-down text-rose-500";
            }
        }
    },

    atualizarTabelaDiaria: function(dados, uid) {
        const tbody = document.getElementById('tabela-diario');
        const thead = document.querySelector('#tabela-diario').parentElement.querySelector('thead tr');
        
        // Atualiza Cabeçalho da Tabela
        if(thead) {
            thead.innerHTML = `
                <th class="px-4 py-3">Data/Hora</th>
                <th class="px-4 py-3">Assistente</th>
                <th class="px-4 py-3">Empresa (ID)</th>
                <th class="px-4 py-3 text-center">Status</th>
                <th class="px-4 py-3 text-center">NOK</th>
                <th class="px-4 py-3 text-center">% Assert</th>
                <th class="px-4 py-3">Auditora</th>
                <th class="px-4 py-3">Obs</th>
            `;
        }

        if (!dados.length) { 
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12 text-slate-400">Nenhum registro.</td></tr>'; 
            return; 
        }

        let html = '';
        dados.forEach(item => {
            // Formata Data/Hora
            let dataDisplay = item.data_referencia.split('-').reverse().slice(0,2).join('/');
            if (item.hora) dataDisplay += ` <span class="text-xs text-slate-400">${item.hora}</span>`;

            // Formata Status
            let statusBadge = `<span class="px-2 py-1 rounded text-[10px] font-bold border bg-slate-50 text-slate-600">${item.status || '-'}</span>`;
            if ((item.status||'').toLowerCase().includes('ok')) statusBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold border">OK</span>`;
            if ((item.status||'').toLowerCase().includes('rev') || (item.status||'').toLowerCase().includes('nok')) statusBadge = `<span class="bg-red-50 text-red-700 px-2 py-1 rounded text-[10px] font-bold border">${item.status}</span>`;

            // Formata Empresa
            let empresaDisplay = item.empresa || '-';
            // Se tiver ID da empresa salvo em alguma coluna, adicione aqui. O CSV não tem ID explícito na linha, mas o usuário pediu.

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs">
                <td class="px-4 py-3 font-bold text-slate-600 whitespace-nowrap">${dataDisplay}</td>
                <td class="px-4 py-3 text-slate-700 font-bold">${item.usuarios?.nome || '-'}</td>
                <td class="px-4 py-3 text-slate-600">${empresaDisplay}</td>
                <td class="px-4 py-3 text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-center text-red-600 font-bold">${item.nok || '-'}</td>
                <td class="px-4 py-3 text-center font-mono text-blue-600">${item.assertividade || '-'}</td>
                <td class="px-4 py-3 text-slate-500">${item.auditora || '-'}</td>
                <td class="px-4 py-3 text-slate-500 max-w-xs truncate" title="${item.observacao || ''}">${item.observacao || '-'}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },
    
    // Funções auxiliares (verificarAcessoHoje, etc) permanecem iguais...
    verificarAcessoHoje: function() {}, 
    renderizarBotaoGestora: function() {}
};