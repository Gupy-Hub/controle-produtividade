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

        // 2. NOVO: Se for Gestora, carrega o painel de status do time
        if (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA') {
            await this.renderizarStatusCheckinGestora();
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
            // CORREÇÃO: Utilizando 'funcao' e 'Assistente' (Maiúsculo)
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

    // --- NOVA FUNÇÃO: Painel de Monitoramento da Gestora ---
    renderizarStatusCheckinGestora: async function() {
        const d = new Date();
        d.setDate(d.getDate() - 1); // Sempre referente ao dia anterior (Ontem)
        const diaSemana = d.getDay();

        // Se ontem foi Sábado(6) ou Domingo(0), geralmente não há check-in obrigatório, 
        // mas se quiser exibir mesmo assim, remova o return abaixo.
        // O padrão atual do sistema ignora fds.
        if (diaSemana === 0 || diaSemana === 6) return;

        const dataRef = d.toISOString().split('T')[0];
        
        // Localiza onde inserir o painel (antes da tabela)
        const tabela = document.getElementById('tabela-diario');
        if (!tabela) return;
        
        // Remove painel anterior se houver (para não duplicar ao recarregar)
        const oldPanel = document.getElementById('panel-checkin-gestora');
        if (oldPanel) oldPanel.remove();

        // Cria o container do painel
        const panel = document.createElement('div');
        panel.id = 'panel-checkin-gestora';
        panel.className = "mb-6 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden";
        panel.innerHTML = `
            <div class="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                    <i class="fas fa-clipboard-check text-blue-600"></i> 
                    Check-in da Equipe <span class="text-slate-400 font-normal ml-1">(Referente a: ${dataRef.split('-').reverse().join('/')})</span>
                </h3>
                <span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase">Visão Gestora</span>
            </div>
            <div id="checkin-content" class="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-64 overflow-y-auto">
                <div class="col-span-full text-center text-slate-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando status...</div>
            </div>
            <div id="checkin-footer" class="bg-slate-50 px-4 py-2 border-t border-slate-200 flex gap-4 text-xs font-bold text-slate-600"></div>
        `;

        // Insere o painel antes do container da tabela
        const containerTabela = tabela.closest('.overflow-x-auto') || tabela.parentElement;
        containerTabela.before(panel);

        try {
            // 1. Busca todos os assistentes ativos
            const { data: usuarios, error: errUser } = await MinhaArea.supabase
                .from('usuarios')
                .select('id, nome')
                .eq('funcao', 'Assistente')
                .eq('ativo', true)
                .neq('contrato', 'FINALIZADO')
                .order('nome');
            
            if (errUser) throw errUser;

            // 2. Busca quem fez check-in na data de referência
            const { data: acessos, error: errAcesso } = await MinhaArea.supabase
                .from('acessos_diarios')
                .select('usuario_id')
                .eq('data_referencia', dataRef);

            if (errAcesso) throw errAcesso;

            const mapCheckin = new Set(acessos.map(a => a.usuario_id));

            // Renderiza os cards
            const contentDiv = panel.querySelector('#checkin-content');
            if (usuarios.length === 0) {
                contentDiv.innerHTML = '<div class="col-span-full text-center text-slate-400">Nenhum assistente ativo encontrado.</div>';
                return;
            }

            let realizadoCount = 0;
            const cardsHtml = usuarios.map(u => {
                const feito = mapCheckin.has(u.id);
                if (feito) realizadoCount++;
                return `
                    <div class="flex items-center justify-between p-2 rounded border ${feito ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}">
                        <span class="truncate text-xs font-bold ${feito ? 'text-emerald-700' : 'text-rose-700'}" title="${u.nome}">${u.nome.split(' ')[0]} ${u.nome.split(' ')[1] || ''}</span>
                        <i class="fas ${feito ? 'fa-check-circle text-emerald-500' : 'fa-times-circle text-rose-400'}"></i>
                    </div>
                `;
            }).join('');

            contentDiv.innerHTML = cardsHtml;

            // Atualiza rodapé com totais
            const pendentes = usuarios.length - realizadoCount;
            const pct = Math.round((realizadoCount / usuarios.length) * 100);
            
            panel.querySelector('#checkin-footer').innerHTML = `
                <span>Total: ${usuarios.length}</span>
                <span class="text-emerald-600">Realizado: ${realizadoCount}</span>
                <span class="text-rose-600">Pendente: ${pendentes}</span>
                <span class="ml-auto text-blue-600">Adesão: ${pct}%</span>
            `;

        } catch (err) {
            console.error("Erro checkin gestora:", err);
            panel.querySelector('#checkin-content').innerHTML = `<div class="col-span-full text-center text-rose-500">Erro ao carregar dados: ${err.message}</div>`;
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