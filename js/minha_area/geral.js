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

        // 2. NOVO: Se for Gestora, carrega o MAPA DE CHECK-IN (Cartão Ponto)
        if (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA') {
            await this.renderizarMapaCheckinGestora();
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

            // PROCESSAMENTO
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

            this.atualizarKPIs(dadosProcessados, mediaTime);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    // --- NOVA FUNÇÃO: Mapa de Check-in Mensal (Estilo Cartão Ponto) ---
    renderizarMapaCheckinGestora: async function() {
        // Define o intervalo: Do dia 1 do mês da referência até ONTEM
        const referencia = new Date();
        referencia.setDate(referencia.getDate() - 1); // Ontem
        
        const y = referencia.getFullYear();
        const m = referencia.getMonth();
        
        const start = new Date(y, m, 1);
        const end = referencia;

        // Se o mês virou hoje (dia 1), ontem era mês passado. Ajusta para mostrar mês passado se necessário,
        // mas por padrão mostra o mês da data de referência (Ontem).

        // Localiza onde inserir o painel
        const tabela = document.getElementById('tabela-diario');
        if (!tabela) return;
        
        // Remove painel anterior para evitar duplicidade
        const oldPanel = document.getElementById('panel-checkin-gestora');
        if (oldPanel) oldPanel.remove();

        // Cria estrutura do painel
        const panel = document.createElement('div');
        panel.id = 'panel-checkin-gestora';
        panel.className = "mb-6 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden";
        
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        
        panel.innerHTML = `
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <i class="fas fa-calendar-alt text-blue-600"></i> 
                    Controle de Check-in: ${meses[m]}
                </h3>
                <span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase">Visão Gestora</span>
            </div>
            <div id="checkin-content" class="overflow-x-auto">
                <div class="p-6 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Gerando mapa de presença...</div>
            </div>
        `;
        
        const containerTabela = tabela.closest('.overflow-x-auto') || tabela.parentElement;
        containerTabela.before(panel);

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

             // Mapeia acessos para consulta rápida: map[userId] = Set(dates)
             const map = {};
             usuarios.forEach(u => map[u.id] = new Set());
             acessos.forEach(a => {
                 if(map[a.usuario_id]) map[a.usuario_id].add(a.data_referencia);
             });

             // Gera array de datas (colunas)
             const dates = [];
             let curr = new Date(start);
             while(curr <= end) {
                 dates.push(new Date(curr));
                 curr.setDate(curr.getDate() + 1);
             }
             
             // Renderiza Tabela
             if (dates.length === 0) {
                 panel.querySelector('#checkin-content').innerHTML = '<div class="p-6 text-center text-slate-400">Nenhum dia contabilizado neste mês ainda.</div>';
                 return;
             }

             let html = '<table class="w-full text-xs text-left border-collapse whitespace-nowrap">';
             
             // Cabeçalho (Datas)
             html += '<thead class="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200"><tr>';
             html += '<th class="px-4 py-3 border-r border-slate-100 sticky left-0 bg-slate-50 z-10 shadow-[1px_0_5px_-2px_rgba(0,0,0,0.1)]">Colaborador</th>';
             dates.forEach(d => {
                 const isWk = (d.getDay() === 0 || d.getDay() === 6);
                 html += `<th class="px-2 py-2 text-center min-w-[35px] border-r border-slate-100 ${isWk ? 'bg-slate-100/50 text-slate-400' : ''}">${d.getDate()}</th>`;
             });
             html += '<th class="px-3 py-2 text-center text-blue-600 bg-blue-50/20">Adesão</th></tr></thead>';

             // Corpo (Linhas de Usuários)
             html += '<tbody class="divide-y divide-slate-100">';
             usuarios.forEach(u => {
                 html += '<tr class="hover:bg-slate-50 transition-colors">';
                 // Nome Fixo
                 html += `<td class="px-4 py-2 font-bold text-slate-600 border-r border-slate-100 sticky left-0 bg-white z-10 shadow-[1px_0_5px_-2px_rgba(0,0,0,0.1)] truncate max-w-[180px]" title="${u.nome}">
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
                         cellClass = 'text-emerald-500 bg-emerald-50/50';
                     } else if (isWeekend) {
                         cellContent = '<span class="text-[9px]">-</span>';
                         cellClass = 'text-slate-300 bg-slate-50';
                     } else {
                         cellContent = '<i class="fas fa-times"></i>'; // Falta
                         cellClass = 'text-rose-300 bg-rose-50/50';
                     }

                     html += `<td class="px-1 py-2 text-center border-r border-slate-100 ${cellClass}">${cellContent}</td>`;
                 });

                 // Coluna de % de Adesão
                 const pct = workDays > 0 ? Math.round((hits / workDays) * 100) : 0;
                 let color = pct >= 95 ? 'text-emerald-600 bg-emerald-50' : (pct >= 80 ? 'text-blue-600 bg-blue-50' : 'text-rose-600 bg-rose-50');
                 html += `<td class="px-3 py-2 text-center font-bold ${color}">${pct}%</td>`;

                 html += '</tr>';
             });
             html += '</tbody></table>';

             panel.querySelector('#checkin-content').innerHTML = html;

        } catch (e) {
            console.error(e);
            panel.querySelector('#checkin-content').innerHTML = `<div class="p-6 text-center text-red-500">Erro ao carregar mapa: ${e.message}</div>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        const totalMeta = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        const atingimento = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;

        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(totalMeta).toLocaleString('pt-BR'));
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
        if (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA') return;

        const d = new Date(); d.setDate(d.getDate() - 1); // Check-in é sempre de ONTEM
        if(d.getDay() === 0 || d.getDay() === 6) { if(box) box.classList.add('hidden'); return; }
        
        const { data } = await MinhaArea.supabase.from('acessos_diarios').select('id').eq('usuario_id', MinhaArea.user.id).eq('data_referencia', d.toISOString().split('T')[0]);
        if (data && data.length > 0) { if(box) box.classList.add('hidden'); } else { if(box) box.classList.remove('hidden'); }
    },

    confirmarAcessoHoje: async function() {
        // ... (Mesma função anterior)
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        const d = new Date(); d.setDate(d.getDate() - 1); // Confirma para ONTEM
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({ usuario_id: MinhaArea.user.id, data_referencia: d.toISOString().split('T')[0] });
        if(!error) { document.getElementById('box-confirmacao-leitura').classList.add('hidden'); alert("Check-in confirmado!"); } 
        else { alert("Erro: " + error.message); if(btn) btn.innerText = "Tentar Novamente"; }
    }
};