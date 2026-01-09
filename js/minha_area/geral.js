MinhaArea.Diario = {
    dadosAtuais: [],

    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;

        // 1. SEGURANÇA DE DATA
        if (!MinhaArea.dataAtual) MinhaArea.dataAtual = new Date();
        const periodo = MinhaArea.getPeriodo();
        
        // 2. TRATAMENTO DO USUÁRIO ALVO
        // Se for 'todos', mantemos a string. Se for ID numérico, converte.
        let uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;
        
        console.log("Diario: Carregando dados para:", uid);

        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        // Verificação de Check-in (Apenas se estiver vendo o próprio perfil e não for 'todos')
        this.verificarAcessoHoje(uid);

        // Botão Gestora
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || 
                          cargo === 'GESTORA' || cargo === 'AUDITORA' || 
                          MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (isGestora) {
            this.renderizarBotaoGestora();
        }

        try {
            // 3. QUERY PRODUÇÃO PESSOAL (Ou TODOS)
            let queryProducao = MinhaArea.supabase
                .from('producao')
                .select('*, usuarios!inner(nome)')
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            // CRÍTICO: Só filtra por ID se NÃO for 'todos'
            if (uid !== 'todos') {
                queryProducao = queryProducao.eq('usuario_id', uid);
            }

            const { data: producao, error } = await queryProducao;
            if (error) throw error;

            // 4. QUERY PRODUÇÃO TIME (Média)
            // Busca dados de assistentes para calcular a média geral
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(funcao)')
                .eq('usuarios.funcao', 'Assistente') 
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // 5. METAS
            let metas = [];
            // Só busca metas específicas se tiver um usuário selecionado
            if (uid !== 'todos') {
                const { data: m } = await MinhaArea.supabase
                    .from('metas')
                    .select('*')
                    .eq('usuario_id', uid)
                    .order('data_inicio', { ascending: false });
                metas = m || [];
            }

            // --- CÁLCULOS ---
            let metaMensal = 0;
            let diasUteisTotal = 0;
            const ano = MinhaArea.dataAtual.getFullYear();
            const mes = MinhaArea.dataAtual.getMonth();
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();

            for (let d = 1; d <= ultimoDia; d++) {
                const dataDia = new Date(ano, mes, d);
                const diaSemana = dataDia.getDay();
                if (diaSemana !== 0 && diaSemana !== 6) {
                    diasUteisTotal++;
                    const dataStr = dataDia.toISOString().split('T')[0];
                    let metaDoDia = 650;
                    if (metas.length > 0) {
                        const m = metas.find(mt => mt.data_inicio <= dataStr);
                        if (m) metaDoDia = Number(m.valor_meta);
                    }
                    metaMensal += metaDoDia;
                }
            }

            // PROCESSAMENTO
            this.dadosAtuais = producao.map(item => {
                let metaBase = 650;
                if (item.meta_diaria && Number(item.meta_diaria) > 0) metaBase = Number(item.meta_diaria);
                else if (metas.length > 0) {
                    const m = metas.find(meta => meta.data_inicio <= item.data_referencia);
                    if (m) metaBase = Number(m.valor_meta);
                }

                let fator = 1;
                if (item.fator !== null && item.fator !== undefined) fator = Number(item.fator);
                else if (item.fator_multiplicador !== null && item.fator_multiplicador !== undefined) fator = Number(item.fator_multiplicador);

                return {
                    id: item.id,
                    data_referencia: item.data_referencia,
                    quantidade: Number(item.quantidade) || 0,
                    meta_original: metaBase,
                    meta_ajustada: Math.round(metaBase * (fator === 0 ? 0 : fator)),
                    fator: fator,
                    observacao: item.observacao || '',
                    observacao_gestora: item.observacao_gestora || '',
                    justificativa: item.justificativa || '',
                    nome_usuario: item.usuarios?.nome || '' // Para saber de quem é se for 'todos'
                };
            });

            // Média do Time
            let mediaTime = 0;
            if (producaoTime && producaoTime.length > 0) {
                const totalTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
                const diasTime = producaoTime.reduce((acc, curr) => {
                    const f = curr.fator !== null ? Number(curr.fator) : 1;
                    return acc + (f > 0 ? 1 : 0);
                }, 0);
                mediaTime = diasTime > 0 ? Math.round(totalTime / diasTime) : 0;
            }

            this.atualizarKPIs(this.dadosAtuais, mediaTime, metaMensal, diasUteisTotal, uid);
            this.atualizarTabelaDiaria(this.dadosAtuais, uid);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    filtrarTabelaPorDia: function(dataStr) {
        if (!dataStr) {
            this.atualizarTabelaDiaria(this.dadosAtuais, MinhaArea.usuarioAlvo);
            return;
        }
        const filtrados = this.dadosAtuais.filter(d => d.data_referencia === dataStr);
        this.atualizarTabelaDiaria(filtrados, MinhaArea.usuarioAlvo, true);
    },

    atualizarKPIs: function(dados, mediaTime, metaMensal, diasUteisTotal, uid) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        
        // Se for "todos", a meta trabalhada é a soma das metas de todos os registros
        const metaTrabalhada = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);

        // Se for "todos", meta mensal não faz sentido fixo, usamos a acumulada
        const metaAlvo = (uid !== 'todos' && metaMensal > 0) ? metaMensal : metaTrabalhada;
            
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        // Média: Se for 'todos', é a média geral do filtro
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        
        const pctMensal = metaAlvo > 0 ? Math.round((totalProd / metaAlvo) * 100) : 0; 
        const pctEficiencia = metaTrabalhada > 0 ? Math.round((totalProd / metaTrabalhada) * 100) : 0; 

        // Melhor Dia
        let melhorDia = null;
        let maiorPct = -1;
        dados.forEach(d => {
            if (d.meta_ajustada > 0 && d.fator > 0) {
                const pct = d.quantidade / d.meta_ajustada;
                if (pct > maiorPct) { maiorPct = pct; melhorDia = d; }
            }
        });

        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(metaAlvo).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${pctMensal}%`);
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', uid === 'todos' ? '-' : `${diasEfetivos}/${diasUteisTotal || 0}`);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(pctMensal, 100)}%`;
            bar.className = pctEficiencia >= 100 ? "h-full bg-emerald-500 rounded-full" : (pctEficiencia >= 85 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if (uid === 'todos') {
                compMsg.innerHTML = '<span class="text-slate-400">Visão Geral da Equipe</span>';
            } else {
                if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-arrow-up mr-1"></i>Acima da média!</span>';
                else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600 font-bold"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média.</span>';
                else compMsg.innerHTML = '<span class="text-blue-600 font-bold">Na média do time.</span>';
            }
        }

        // Status Dinâmico
        const txtStatus = document.getElementById('kpi-status-text');
        const iconStatus = document.getElementById('icon-status');
        
        if(txtStatus && iconStatus) {
            let statusHtml = "";
            let iconClass = "";
            let tooltipText = "";

            if(pctEficiencia >= 100) {
                statusHtml = "<span class='text-emerald-600'>Excelente!</span>";
                iconClass = "fas fa-star text-emerald-500";
                tooltipText = "Eficiência acima de 100%!";
            } else if(pctEficiencia >= 85) {
                statusHtml = "<span class='text-blue-600'>Bom desempenho.</span>";
                iconClass = "fas fa-thumbs-up text-blue-500";
                tooltipText = "Eficiência entre 85% e 99%.";
            } else {
                statusHtml = "<span class='text-rose-600'>Abaixo da Meta.</span>";
                iconClass = "fas fa-thumbs-down text-rose-500";
                tooltipText = "Eficiência abaixo de 85%.";
            }

            iconStatus.className = iconClass;
            const iconContainer = document.getElementById('icon-status-container');
            if(iconContainer) { iconContainer.title = tooltipText; }

            let bestDayHtml = "";
            if (melhorDia) {
                const dia = melhorDia.data_referencia.split('-').reverse().slice(0, 2).join('/');
                const pctBest = Math.round(maiorPct * 100);
                bestDayHtml = `
                <div class="text-right cursor-pointer hover:bg-slate-50 rounded px-1 transition" onclick="MinhaArea.Diario.filtrarTabelaPorDia('${melhorDia.data_referencia}')" title="Clique para focar neste dia">
                    <span class="text-[10px] text-slate-400 uppercase tracking-tighter">Melhor Dia</span>
                    <div class="text-xs font-black text-slate-600">${dia} <span class="text-blue-600">(${pctBest}%)</span></div>
                </div>`;
            }

            const containerStatus = txtStatus.parentElement;
            containerStatus.className = "mt-2 flex justify-between items-end";
            containerStatus.innerHTML = `<div class="text-xs font-bold" title="${tooltipText}">${statusHtml}</div>${bestDayHtml}`;
        }
    },

    atualizarTabelaDiaria: function(dados, uid, isFiltered = false) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        let headerRow = '';
        if (isFiltered) {
            headerRow = `<tr><td colspan="5" class="bg-blue-50 text-center py-2 text-xs font-bold text-blue-700">
                <button onclick="MinhaArea.Diario.filtrarTabelaPorDia(null)" class="hover:underline flex items-center justify-center gap-2 w-full h-full">
                    <i class="fas fa-times-circle"></i> Exibindo dia selecionado. Clique aqui para ver todos.
                </button>
            </td></tr>`;
        }

        if (!dados.length) { 
            tbody.innerHTML = headerRow + '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registro encontrado.</td></tr>'; 
            return; 
        }
        
        let html = headerRow;
        dados.forEach(item => {
            const fator = item.fator;
            const pct = item.meta_ajustada > 0 ? Math.round((item.quantidade / item.meta_ajustada) * 100) : 0;
            
            let statusBadge = fator === 0 
                ? '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200">Abonado</span>'
                : `<span class="${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : (pct >= 80 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')} px-2 py-1 rounded text-[10px] font-bold border">${pct}%</span>`;

            let obsHtml = '';
            if (uid === 'todos') {
                // Se for visão geral, mostra o nome da pessoa na obs
                obsHtml += `<div class="mb-1 text-blue-600 font-bold text-[10px]">${item.nome_usuario}</div>`;
            }
            if (item.observacao) obsHtml += `<div class="mb-1 text-slate-700">${item.observacao}</div>`;
            if (item.justificativa) obsHtml += `<div class="text-xs text-slate-500 italic"><i class="fas fa-info-circle mr-1"></i>Just.: ${item.justificativa}</div>`;
            if (item.observacao_gestora) obsHtml += `<div class="mt-1 text-[10px] bg-blue-50 text-blue-700 p-1 rounded border border-blue-100"><i class="fas fa-comment mr-1"></i>Gestão: ${item.observacao_gestora}</div>`;
            if (!obsHtml) obsHtml = '<span class="text-slate-300">-</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-600 text-xs cursor-pointer hover:text-blue-600 hover:underline" 
                    title="Clique para filtrar apenas este dia" 
                    onclick="MinhaArea.Diario.filtrarTabelaPorDia('${item.data_referencia}')">
                    ${item.data_referencia.split('-').reverse().join('/')}
                </td>
                <td class="px-6 py-4 text-center font-black text-slate-700 text-base">${item.quantidade}</td>
                <td class="px-6 py-4 text-center text-xs text-slate-500">
                    ${item.meta_original} ${fator < 1 ? `<span class="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">x${fator}</span>` : ''}
                </td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-xs text-slate-600 max-w-sm break-words leading-relaxed">${obsHtml}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },

    verificarAcessoHoje: async function(uidAlvo) {
        const box = document.getElementById('box-confirmacao-leitura');
        if (!box) return;
        
        // Não mostra se for visão 'todos' ou se estiver vendo outro usuário
        if (uidAlvo === 'todos' || String(uidAlvo) !== String(MinhaArea.user.id)) { 
            box.classList.add('hidden'); 
            return; 
        }

        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        if (funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA') return;
        
        const d = new Date(); d.setDate(d.getDate() - 1); 
        if(d.getDay() === 0 || d.getDay() === 6) { box.classList.add('hidden'); return; }
        
        const { data } = await MinhaArea.supabase.from('acessos_diarios').select('id').eq('usuario_id', MinhaArea.user.id).eq('data_referencia', d.toISOString().split('T')[0]);
        if (data && data.length > 0) { box.classList.add('hidden'); } else { box.classList.remove('hidden'); }
    },

    confirmarAcessoHoje: async function() {
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        const d = new Date(); d.setDate(d.getDate() - 1); 
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({ usuario_id: MinhaArea.user.id, data_referencia: d.toISOString().split('T')[0] });
        if(!error) { document.getElementById('box-confirmacao-leitura').classList.add('hidden'); alert("Check-in confirmado!"); } 
        else { alert("Erro: " + error.message); if(btn) btn.innerText = "Tentar Novamente"; }
    },

    renderizarBotaoGestora: function() {
        const containerTabela = document.getElementById('tabela-diario');
        if (!containerTabela) return;
        const header = containerTabela.closest('.bg-white').querySelector('.flex.justify-between');
        // (Opcional) Adicione botões extras aqui se necessário
    }
};