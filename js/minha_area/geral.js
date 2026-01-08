MinhaArea.Diario = {
    dadosAtuais: [], // Cache para filtros locais

    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;

        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;

        console.log("Diario: Carregando dados para ID:", uid);

        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        // 1. Verificação de Check-in Pessoal
        this.verificarAcessoHoje(uid);

        // 2. Botão Gestora
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || 
                          cargo === 'GESTORA' || cargo === 'AUDITORA' || 
                          MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (isGestora) {
            this.renderizarBotaoGestora();
        }

        try {
            // 3. DADOS PESSOAIS
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 4. DADOS DO TIME
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(funcao)')
                .eq('usuarios.funcao', 'Assistente') 
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // 5. METAS
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // 6. ESTATÍSTICAS GESTORA
            let statsEquipe = null;
            if (isGestora) {
                const { data: usersTeam } = await MinhaArea.supabase
                   .from('usuarios')
                   .select('contrato')
                   .eq('funcao', 'Assistente')
                   .eq('ativo', true)
                   .neq('contrato', 'FINALIZADO');
                
                if (usersTeam) {
                    const clt = usersTeam.filter(u => u.contrato === 'CLT').length;
                    const pj = usersTeam.length - clt;
                    statsEquipe = { clt, pj };
                }
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
                    if (metas && metas.length > 0) {
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
                else if (metas && metas.length > 0) {
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
                    justificativa: item.justificativa || ''
                };
            });

            let mediaTime = 0;
            if (producaoTime && producaoTime.length > 0) {
                const totalTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
                const diasTime = producaoTime.reduce((acc, curr) => {
                    const f = curr.fator !== null ? Number(curr.fator) : 1;
                    return acc + (f > 0 ? 1 : 0);
                }, 0);
                mediaTime = diasTime > 0 ? Math.round(totalTime / diasTime) : 0;
            }

            this.atualizarKPIs(this.dadosAtuais, mediaTime, metaMensal, diasUteisTotal, statsEquipe);
            this.atualizarTabelaDiaria(this.dadosAtuais);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    filtrarTabelaPorDia: function(dataStr) {
        if (!dataStr) {
            this.atualizarTabelaDiaria(this.dadosAtuais);
            return;
        }
        const filtrados = this.dadosAtuais.filter(d => d.data_referencia === dataStr);
        this.atualizarTabelaDiaria(filtrados, true);
    },

    atualizarKPIs: function(dados, mediaTime, metaMensal, diasUteisTotal, statsEquipe) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        
        // Meta para os dias trabalhados (para cálculo de eficiência/status)
        const metaTrabalhada = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);

        // Meta Mensal
        const metaAlvo = (metaMensal && metaMensal > 0) ? metaMensal : metaTrabalhada;
            
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        
        // Porcentagens
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
        this.setTxt('kpi-dias', `${diasEfetivos}/${diasUteisTotal || 0}`);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(pctMensal, 100)}%`;
            bar.className = pctEficiencia >= 100 ? "h-full bg-emerald-500 rounded-full" : (pctEficiencia >= 85 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-arrow-up mr-1"></i>Acima da média!</span>';
            else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600 font-bold"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média.</span>';
            else compMsg.innerHTML = '<span class="text-blue-600 font-bold">Na média do time.</span>';
        }

        // --- STATUS DINÂMICO COM TOOLTIP ---
        const txtStatus = document.getElementById('kpi-status-text');
        const iconStatus = document.getElementById('icon-status');
        
        if(txtStatus && iconStatus) {
            let statusHtml = "";
            let iconClass = "";
            let tooltipText = "";

            if(pctEficiencia >= 100) {
                statusHtml = "<span class='text-emerald-600'>Excelente!</span>";
                iconClass = "fas fa-star text-emerald-500";
                tooltipText = "Excelente: Eficiência acima de 100%!";
            } else if(pctEficiencia >= 85) {
                statusHtml = "<span class='text-blue-600'>Bom desempenho.</span>";
                iconClass = "fas fa-thumbs-up text-blue-500";
                tooltipText = "Bom desempenho: Eficiência entre 85% e 99%.";
            } else {
                statusHtml = "<span class='text-rose-600'>Abaixo da Meta.</span>";
                iconClass = "fas fa-thumbs-down text-rose-500";
                tooltipText = "Atenção: Eficiência abaixo de 85%.";
            }

            iconStatus.className = iconClass;
            
            // Adiciona o Tooltip nativo (title)
            const iconContainer = document.getElementById('icon-status-container');
            if(iconContainer) {
                iconContainer.title = tooltipText;
                iconContainer.style.cursor = "help";
            }

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

        // CLT/PJ Rodapé
        const cardDias = document.getElementById('kpi-dias')?.closest('.card-stat');
        if (cardDias) {
            const oldStats = document.getElementById('stats-equipe-gestora');
            if (oldStats) oldStats.remove();

            if (statsEquipe) {
                const div = document.createElement('div');
                div.id = 'stats-equipe-gestora';
                div.className = "mt-2 pt-2 border-t border-slate-100 flex justify-between text-[9px] font-bold text-slate-400";
                div.innerHTML = `<span>CLT: <span class="text-slate-600 font-extrabold">${statsEquipe.clt}</span></span><span>PJ: <span class="text-slate-600 font-extrabold">${statsEquipe.pj}</span></span>`;
                cardDias.appendChild(div);
            }
        }
    },

    atualizarTabelaDiaria: function(dados, isFiltered = false) {
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
            if (item.observacao) obsHtml += `<div class="mb-1 text-slate-700">${item.observacao}</div>`;
            if (item.justificativa) obsHtml += `<div class="text-xs text-slate-500 italic"><i class="fas fa-info-circle mr-1"></i>Just.: ${item.justificativa}</div>`;
            if (item.observacao_gestora) obsHtml += `<div class="mt-1 text-[10px] bg-blue-50 text-blue-700 p-1 rounded border border-blue-100"><i class="fas fa-comment mr-1"></i>Gestão: ${item.observacao_gestora}</div>`;
            if (!obsHtml) obsHtml = '<span class="text-slate-300">-</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-600 text-xs cursor-pointer hover:text-blue-600 hover:underline" 
                    title="Clique para filtrar apenas este dia" 
                    onclick="MinhaArea.Diario.filtrarTabelaPorDia('${item.data_referencia}')">
                    <i class="fas fa-filter text-[10px] mr-1 opacity-50"></i>
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
        if (String(uidAlvo) !== String(MinhaArea.user.id)) { if(box) box.classList.add('hidden'); return; }
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        if (funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA') return;
        const d = new Date(); d.setDate(d.getDate() - 1); 
        if(d.getDay() === 0 || d.getDay() === 6) { if(box) box.classList.add('hidden'); return; }
        const { data } = await MinhaArea.supabase.from('acessos_diarios').select('id').eq('usuario_id', MinhaArea.user.id).eq('data_referencia', d.toISOString().split('T')[0]);
        if (data && data.length > 0) { if(box) box.classList.add('hidden'); } else { if(box) box.classList.remove('hidden'); }
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
        if (header && !document.getElementById('btn-checkin-gestora')) {
            const btn = document.createElement('button');
            btn.id = 'btn-checkin-gestora';
            btn.className = "ml-auto bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm flex items-center gap-2";
            btn.innerHTML = '<i class="fas fa-calendar-check"></i> Cartão Ponto Equipe';
            btn.onclick = () => this.abrirModalCheckin();
            header.appendChild(btn);
        }
    },

    abrirModalCheckin: async function() {
        let modal = document.getElementById('modal-checkin-gestora');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-checkin-gestora';
            modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm hidden animate-enter";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-[95%] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                    <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                        <h3 class="font-bold text-slate-700 text-lg flex items-center gap-2">
                            <i class="fas fa-calendar-alt text-blue-600"></i> Cartão Ponto da Equipe
                        </h3>
                        <button onclick="document.getElementById('modal-checkin-gestora').classList.add('hidden')" class="text-slate-400 hover:text-red-500 transition px-2"><i class="fas fa-times text-xl"></i></button>
                    </div>
                    <div id="modal-checkin-body" class="p-6 overflow-auto flex-1 custom-scroll bg-white">
                        <div class="text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</div>
                    </div>
                    <div class="p-4 border-t border-slate-200 bg-slate-50 text-right">
                        <span class="text-xs text-slate-400 mr-2">Dados referentes até o dia anterior.</span>
                        <button onclick="document.getElementById('modal-checkin-gestora').classList.add('hidden')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-4 rounded text-sm transition">Fechar</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
        await this.renderizarConteudoModal();
    },

    renderizarConteudoModal: async function() {
        const container = document.getElementById('modal-checkin-body');
        const referencia = new Date(); referencia.setDate(referencia.getDate() - 1);
        const y = referencia.getFullYear(); const m = referencia.getMonth();
        const start = new Date(y, m, 1); const end = referencia;
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

        try {
             const { data: usuarios } = await MinhaArea.supabase.from('usuarios').select('id, nome').eq('funcao', 'Assistente').eq('ativo', true).neq('contrato', 'FINALIZADO').order('nome');
             const { data: acessos } = await MinhaArea.supabase.from('acessos_diarios').select('usuario_id, data_referencia').gte('data_referencia', start.toISOString()).lte('data_referencia', end.toISOString());
             
             const map = {}; usuarios.forEach(u => map[u.id] = new Set());
             acessos.forEach(a => { if(map[a.usuario_id]) map[a.usuario_id].add(a.data_referencia); });

             const dates = []; let curr = new Date(start);
             while(curr <= end) { dates.push(new Date(curr)); curr.setDate(curr.getDate() + 1); }
             
             if (dates.length === 0) {
                 container.innerHTML = `<div class="p-10 text-center text-slate-400">Nenhum dia contabilizado em ${meses[m]} ainda.</div>`;
                 return;
             }

             let html = `
                <div class="mb-4 flex items-center gap-2"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">${meses[m]} ${y}</span></div>
                <table class="w-full text-xs text-left border-collapse whitespace-nowrap shadow-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200"><tr>
                <th class="px-4 py-3 border-r border-slate-200 sticky left-0 bg-slate-100 z-10 shadow">Colaborador</th>`;
             
             dates.forEach(d => {
                 const isWk = (d.getDay()===0||d.getDay()===6);
                 const dateStr = d.toISOString().split('T')[0];
                 // CABEÇALHO CLICÁVEL (AGORA PARA TODOS OS DIAS)
                 html += `<th class="px-2 py-2 text-center min-w-[35px] border-r border-slate-200 ${isWk ? 'bg-slate-200/50 text-slate-500 hover:bg-slate-300 cursor-pointer' : 'cursor-pointer hover:bg-blue-200 hover:text-blue-800'} transition" 
                    onclick="MinhaArea.Diario.detalharDiaTime('${dateStr}')" title="Ver Produção da Equipe em ${d.getDate()}/${m+1}">
                    ${d.getDate()}
                 </th>`;
             });
             html += '<th class="px-3 py-2 text-center text-blue-700 bg-blue-50 border-l border-blue-100">Adesão</th></tr></thead><tbody class="divide-y divide-slate-100">';
             
             usuarios.forEach(u => {
                 html += `<tr class="hover:bg-blue-50/30 transition-colors"><td class="px-4 py-2 font-bold text-slate-700 border-r border-slate-200 sticky left-0 bg-white z-10 shadow truncate max-w-[200px]">${u.nome.split(' ')[0]} <span class="text-slate-400 font-normal">${u.nome.split(' ').slice(1).join(' ')}</span></td>`;
                 let hits = 0; let workDays = 0;
                 dates.forEach(d => {
                     const dateStr = d.toISOString().split('T')[0];
                     const isWeekend = (d.getDay()===0||d.getDay()===6);
                     const checked = map[u.id].has(dateStr);
                     if (!isWeekend) workDays++; if (checked) hits++;
                     let cell = checked ? '<i class="fas fa-check"></i>' : (isWeekend ? '-' : '<i class="fas fa-times"></i>');
                     let cls = checked ? 'text-emerald-500 bg-emerald-50/50 font-bold' : (isWeekend ? 'text-slate-300 bg-slate-50' : 'text-rose-300 bg-rose-50/50');
                     html += `<td class="px-1 py-2 text-center border-r border-slate-100 ${cls}">${cell}</td>`;
                 });
                 const pct = workDays > 0 ? Math.round((hits / workDays) * 100) : 0;
                 html += `<td class="px-3 py-2 text-center font-bold border-l border-slate-200 ${pct>=95?'text-emerald-600':(pct>=80?'text-blue-600':'text-rose-600')}">${pct}%</td></tr>`;
             });
             html += '</tbody></table>';
             container.innerHTML = html;
        } catch (e) { container.innerHTML = `<div class="p-10 text-center text-rose-500">Erro: ${e.message}</div>`; }
    },

    detalharDiaTime: async function(dateStr) {
        let modal = document.getElementById('modal-dia-detalhe');
        if(!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-dia-detalhe';
            modal.className = "fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm hidden";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-[95%] max-w-4xl max-h-[85vh] flex flex-col">
                    <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                        <h3 id="modal-dia-title" class="font-bold text-slate-700 text-lg"></h3>
                        <button onclick="document.getElementById('modal-dia-detalhe').classList.add('hidden')" class="text-slate-400 hover:text-red-500 px-2"><i class="fas fa-times"></i></button>
                    </div>
                    <div id="modal-dia-content" class="p-6 overflow-auto flex-1 custom-scroll"></div>
                </div>`;
            document.body.appendChild(modal);
        }
        
        modal.classList.remove('hidden');
        const content = document.getElementById('modal-dia-content');
        document.getElementById('modal-dia-title').innerHTML = `<i class="fas fa-calendar-day text-blue-600 mr-2"></i> Raio-X do Dia: ${dateStr.split('-').reverse().join('/')}`;
        content.innerHTML = '<div class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando produção da equipe...</div>';

        try {
            const { data: producoes } = await MinhaArea.supabase.from('producao').select('quantidade, observacao, observacao_gestora, usuarios!inner(id, nome, funcao)').eq('usuarios.funcao', 'Assistente').eq('data_referencia', dateStr).order('quantidade', { ascending: false });
            const { data: checkins } = await MinhaArea.supabase.from('acessos_diarios').select('usuario_id').eq('data_referencia', dateStr);
            const checkinSet = new Set(checkins?.map(c => c.usuario_id));
            const { data: todosUsers } = await MinhaArea.supabase.from('usuarios').select('id, nome').eq('funcao', 'Assistente').eq('ativo', true).neq('contrato', 'FINALIZADO').order('nome');

            let html = '<table class="w-full text-sm text-left border-collapse">';
            html += '<thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold"><tr><th class="px-4 py-2">Colaborador</th><th class="px-4 py-2 text-center">Check-in</th><th class="px-4 py-2 text-center">Produção</th><th class="px-4 py-2">Obs</th></tr></thead><tbody class="divide-y divide-slate-100">';

            todosUsers.forEach(u => {
                const prod = producoes?.find(p => p.usuarios.id === u.id);
                const qtd = prod ? prod.quantidade : 0;
                const fezCheckin = checkinSet.has(u.id);
                
                html += `<tr class="hover:bg-slate-50">
                    <td class="px-4 py-2 font-bold text-slate-700">${u.nome}</td>
                    <td class="px-4 py-2 text-center">${fezCheckin ? '<i class="fas fa-check text-emerald-500"></i>' : '<i class="fas fa-times text-rose-300"></i>'}</td>
                    <td class="px-4 py-2 text-center font-bold ${qtd > 0 ? 'text-blue-600' : 'text-slate-300'}">${qtd}</td>
                    <td class="px-4 py-2 text-xs text-slate-500 truncate max-w-xs">${prod?.observacao || '-'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            content.innerHTML = html;

        } catch(e) { content.innerHTML = `<div class="text-center text-rose-500">Erro: ${e.message}</div>`; }
    }
};