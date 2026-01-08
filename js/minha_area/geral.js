MinhaArea.Diario = {
    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;

        const periodo = MinhaArea.getPeriodo();
        
        // --- Usa o Alvo Selecionado (ou o próprio user se não tiver alvo) ---
        const uid = MinhaArea.usuarioAlvo || MinhaArea.user.id;

        console.log("Diario: Carregando dados para ID:", uid);

        const tbody = document.getElementById('tabela-diario');
        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        // 1. Verificação de Check-in Pessoal (Para o usuário logado)
        this.verificarAcessoHoje(uid);

        // 2. Verifica se é Gestora para exibir o BOTÃO do relatório
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        const isGestora = funcao === 'GESTORA' || funcao === 'AUDITORA' || 
                          cargo === 'GESTORA' || cargo === 'AUDITORA' || 
                          MinhaArea.user.id == 1000 || MinhaArea.user.perfil === 'admin';

        if (isGestora) {
            this.renderizarBotaoGestora();
        }

        try {
            // 3. DADOS PESSOAIS (Do Alvo)
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 4. DADOS DO TIME (Sempre todos os assistentes, para média)
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(funcao)')
                .eq('usuarios.funcao', 'Assistente') 
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // 5. METAS (Do Alvo)
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // --- NOVO: CÁLCULO DA META MENSAL (FULL) ---
            // Calcula a meta total do mês (Dias Úteis * Meta Diária Vigente)
            let metaMensal = 0;
            const ano = MinhaArea.dataAtual.getFullYear();
            const mes = MinhaArea.dataAtual.getMonth();
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();

            for (let d = 1; d <= ultimoDia; d++) {
                const dataDia = new Date(ano, mes, d);
                const diaSemana = dataDia.getDay();

                // Considera apenas dias úteis (Segunda a Sexta) - Ajuste se trabalhar sábado
                if (diaSemana !== 0 && diaSemana !== 6) {
                    const dataStr = dataDia.toISOString().split('T')[0];
                    let metaDoDia = 650; // Valor padrão
                    
                    // Verifica qual meta estava valendo neste dia específico
                    if (metas && metas.length > 0) {
                        // Como 'metas' está ordenado decrescente por data_inicio, o find pega a primeira data anterior ou igual
                        const m = metas.find(mt => mt.data_inicio <= dataStr);
                        if (m) metaDoDia = Number(m.valor_meta);
                    }
                    metaMensal += metaDoDia;
                }
            }
            // -------------------------------------------

            // PROCESSAMENTO DOS DADOS DE PRODUÇÃO
            const dadosProcessados = producao.map(item => {
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

            // Passa a metaMensal calculada para a função de KPIs
            this.atualizarKPIs(dadosProcessados, mediaTime, metaMensal);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    // Recebe metaMensal como argumento opcional
    atualizarKPIs: function(dados, mediaTime, metaMensal) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        
        // Se metaMensal for passada (>0), usa ela. Se não, usa o acumulado dos registros (fallback)
        const target = (metaMensal && metaMensal > 0) 
            ? metaMensal 
            : dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);
            
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        const atingimento = target > 0 ? Math.round((totalProd / target) * 100) : 0;

        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(target).toLocaleString('pt-BR')); // Exibe a Meta do Mês
        this.setTxt('kpi-pct', `${atingimento}%`);
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', diasEfetivos);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(atingimento, 100)}%`;
            bar.className = atingimento >= 100 ? "h-full bg-emerald-500 rounded-full" : (atingimento >= 90 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-arrow-up mr-1"></i>Acima da média!</span>';
            else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600 font-bold"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média.</span>';
            else compMsg.innerHTML = '<span class="text-blue-600 font-bold">Na média do time.</span>';
        }

        const txtStatus = document.getElementById('kpi-status-text');
        const iconStatus = document.getElementById('icon-status');
        if(txtStatus && iconStatus) {
            if(atingimento >= 100) {
                txtStatus.innerHTML = "<span class='text-emerald-600'>Excelente! Meta batida.</span>";
                iconStatus.className = "fas fa-star text-emerald-500";
            } else if(atingimento >= 85) {
                txtStatus.innerHTML = "<span class='text-blue-600'>Bom desempenho.</span>";
                iconStatus.className = "fas fa-thumbs-up text-blue-500";
            } else {
                txtStatus.innerHTML = "<span class='text-amber-600'>Precisa melhorar.</span>";
                iconStatus.className = "fas fa-exclamation text-amber-500";
            }
        }
    },

    renderizarBotaoGestora: function() {
        // Encontra o container do cabeçalho da tabela para inserir o botão
        const containerTabela = document.getElementById('tabela-diario');
        if (!containerTabela) return;

        // Sobe na árvore DOM para achar o header (onde tem o título Detalhamento Diário)
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
        // Verifica se o modal já existe no DOM
        let modal = document.getElementById('modal-checkin-gestora');
        
        if (!modal) {
            // Cria o modal se não existir
            modal = document.createElement('div');
            modal.id = 'modal-checkin-gestora';
            modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm hidden animate-enter";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-[95%] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                    <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                        <h3 class="font-bold text-slate-700 text-lg flex items-center gap-2">
                            <i class="fas fa-calendar-alt text-blue-600"></i> Cartão Ponto da Equipe
                        </h3>
                        <button onclick="document.getElementById('modal-checkin-gestora').classList.add('hidden')" class="text-slate-400 hover:text-red-500 transition px-2">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div id="modal-checkin-body" class="p-6 overflow-auto flex-1 custom-scroll bg-white">
                        <div class="text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</div>
                    </div>
                    <div class="p-4 border-t border-slate-200 bg-slate-50 text-right">
                        <span class="text-xs text-slate-400 mr-2">Dados referentes até o dia anterior.</span>
                        <button onclick="document.getElementById('modal-checkin-gestora').classList.add('hidden')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-4 rounded text-sm transition">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Exibe o modal
        modal.classList.remove('hidden');
        
        // Carrega os dados
        await this.renderizarConteudoModal();
    },

    renderizarConteudoModal: async function() {
        const container = document.getElementById('modal-checkin-body');
        
        // Define o intervalo: Do dia 1 do mês de referência (baseado em ONTEM) até ONTEM
        const referencia = new Date();
        referencia.setDate(referencia.getDate() - 1); // Ontem
        
        const y = referencia.getFullYear();
        const m = referencia.getMonth();
        const start = new Date(y, m, 1);
        const end = referencia;

        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

        try {
             // 1. Busca Usuários (Assistentes Ativos)
             const { data: usuarios, error: errUser } = await MinhaArea.supabase
                .from('usuarios')
                .select('id, nome')
                .eq('funcao', 'Assistente')
                .eq('ativo', true)
                .neq('contrato', 'FINALIZADO')
                .order('nome');
             if(errUser) throw errUser;

             // 2. Busca Check-ins no intervalo
             const sStr = start.toISOString().split('T')[0];
             const eStr = end.toISOString().split('T')[0];

             const { data: acessos, error: errAcesso } = await MinhaArea.supabase
                .from('acessos_diarios')
                .select('usuario_id, data_referencia')
                .gte('data_referencia', sStr)
                .lte('data_referencia', eStr);
             if(errAcesso) throw errAcesso;

             // Mapeia acessos
             const map = {};
             usuarios.forEach(u => map[u.id] = new Set());
             acessos.forEach(a => {
                 if(map[a.usuario_id]) map[a.usuario_id].add(a.data_referencia);
             });

             // Gera array de datas
             const dates = [];
             let curr = new Date(start);
             while(curr <= end) {
                 dates.push(new Date(curr));
                 curr.setDate(curr.getDate() + 1);
             }
             
             if (dates.length === 0) {
                 container.innerHTML = `<div class="p-10 text-center text-slate-400 flex flex-col items-center">
                    <i class="fas fa-calendar-times text-4xl mb-3 text-slate-200"></i>
                    <span>Nenhum dia contabilizado em ${meses[m]} ainda.</span>
                    <span class="text-xs mt-1">O mês virou hoje? O relatório começa a contar a partir de amanhã (referente a hoje).</span>
                 </div>`;
                 return;
             }

             let html = `
                <div class="mb-4 flex items-center gap-2">
                    <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">${meses[m]} ${y}</span>
                    <span class="text-xs text-slate-400">Total dias úteis até ontem: ${dates.filter(d => d.getDay()!==0 && d.getDay()!==6).length}</span>
                </div>
                <table class="w-full text-xs text-left border-collapse whitespace-nowrap shadow-sm border border-slate-200 rounded-lg overflow-hidden">
             `;
             
             // Cabeçalho
             html += '<thead class="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200"><tr>';
             html += '<th class="px-4 py-3 border-r border-slate-200 sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Colaborador</th>';
             dates.forEach(d => {
                 const isWk = (d.getDay() === 0 || d.getDay() === 6);
                 html += `<th class="px-2 py-2 text-center min-w-[35px] border-r border-slate-200 ${isWk ? 'bg-slate-200/50 text-slate-400' : ''}">${d.getDate()}</th>`;
             });
             html += '<th class="px-3 py-2 text-center text-blue-700 bg-blue-50 border-l border-blue-100">Adesão</th></tr></thead>';

             // Corpo
             html += '<tbody class="divide-y divide-slate-100">';
             usuarios.forEach(u => {
                 html += '<tr class="hover:bg-blue-50/30 transition-colors">';
                 html += `<td class="px-4 py-2 font-bold text-slate-700 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] truncate max-w-[200px]" title="${u.nome}">
                    ${u.nome.split(' ')[0]} <span class="text-slate-400 font-normal">${u.nome.split(' ').slice(1).join(' ')}</span>
                 </td>`;
                 
                 let hits = 0;
                 let workDays = 0;

                 dates.forEach(d => {
                     const dateStr = d.toISOString().split('T')[0];
                     const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
                     const checked = map[u.id].has(dateStr);
                     
                     if (!isWeekend) workDays++;
                     if (checked) hits++;

                     let cellContent = '';
                     let cellClass = '';

                     if (checked) {
                         cellContent = '<i class="fas fa-check"></i>';
                         cellClass = 'text-emerald-500 bg-emerald-50/50 font-bold';
                     } else if (isWeekend) {
                         cellContent = '<span class="text-[9px]">-</span>';
                         cellClass = 'text-slate-300 bg-slate-50';
                     } else {
                         cellContent = '<i class="fas fa-times"></i>';
                         cellClass = 'text-rose-300 bg-rose-50/50';
                     }

                     html += `<td class="px-1 py-2 text-center border-r border-slate-100 ${cellClass}">${cellContent}</td>`;
                 });

                 const pct = workDays > 0 ? Math.round((hits / workDays) * 100) : 0;
                 let color = pct >= 95 ? 'text-emerald-600 bg-emerald-50' : (pct >= 80 ? 'text-blue-600 bg-blue-50' : 'text-rose-600 bg-rose-50');
                 html += `<td class="px-3 py-2 text-center font-bold border-l border-slate-200 ${color}">${pct}%</td>`;

                 html += '</tr>';
             });
             html += '</tbody></table>';

             container.innerHTML = html;

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="p-10 text-center text-rose-500 bg-rose-50 rounded border border-rose-100">
                <i class="fas fa-exclamation-triangle mb-2 text-2xl"></i><br>
                Erro ao carregar mapa: ${e.message}
            </div>`;
        }
    },

    atualizarTabelaDiaria: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registro encontrado.</td></tr>'; 
            return; 
        }
        
        let html = '';
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
                <td class="px-6 py-4 font-bold text-slate-600 text-xs">${item.data_referencia.split('-').reverse().join('/')}</td>
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
        
        // Se eu sou Admin e estou vendo outro usuário, não devo fazer Check-in por ele
        // Se eu sou Assistente, só vejo meus dados, então uidAlvo == MinhaArea.user.id
        if (String(uidAlvo) !== String(MinhaArea.user.id)) {
            if(box) box.classList.add('hidden');
            return;
        }

        // Se sou Gestora, também não preciso de check-in
        const funcao = (MinhaArea.user.funcao || '').toUpperCase();
        const cargo = (MinhaArea.user.cargo || '').toUpperCase();
        if (funcao === 'GESTORA' || funcao === 'AUDITORA' || cargo === 'GESTORA' || cargo === 'AUDITORA') return;

        const d = new Date(); d.setDate(d.getDate() - 1); // Check-in é sempre de ONTEM
        if(d.getDay() === 0 || d.getDay() === 6) { if(box) box.classList.add('hidden'); return; }
        
        const { data } = await MinhaArea.supabase.from('acessos_diarios').select('id').eq('usuario_id', MinhaArea.user.id).eq('data_referencia', d.toISOString().split('T')[0]);
        if (data && data.length > 0) { if(box) box.classList.add('hidden'); } else { if(box) box.classList.remove('hidden'); }
    },

    confirmarAcessoHoje: async function() {
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        const d = new Date(); d.setDate(d.getDate() - 1); // Confirma para ONTEM
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({ usuario_id: MinhaArea.user.id, data_referencia: d.toISOString().split('T')[0] });
        if(!error) { document.getElementById('box-confirmacao-leitura').classList.add('hidden'); alert("Check-in confirmado!"); } 
        else { alert("Erro: " + error.message); if(btn) btn.innerText = "Tentar Novamente"; }
    }
};