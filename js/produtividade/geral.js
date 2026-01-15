window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    usuarioSelecionado: null,
    
    // Lista de Feriados (ISO Strings para evitar Date Object overhead)
    feriados: {
        "2025": ["01-01", "03-03", "03-04", "04-18", "04-21", "05-01", "06-19", "07-09", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"],
        "2026": ["01-01", "02-17", "02-18", "04-03", "04-21", "05-01", "06-04", "07-09", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"]
    },
    
    // Status que contam como "Esforço Operacional" mesmo sem validação de qualidade imediata
    statusNeutros: ['DUPL', 'EMPR', 'IA', 'NA', 'N/A', 'REVALIDA', 'CANCELADO', 'JUSTIFICADO'],

    init: function() { 
        console.log("🔧 [NEXUS] Produtividade Geral: Iniciando Engine de Cálculo...");
        this.carregarTela(); 
        this.initialized = true; 
    },

    // --- UTILS (Pure Functions para Idempotência) ---
    setTxt: function(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },
    
    parsePercentage: function(val) {
        if (val === null || val === undefined || val === '') return null;
        // Sanitização agressiva: remove %, espaços e troca vírgula por ponto
        let clean = String(val).replace('%', '').replace(',', '.').trim();
        let num = parseFloat(clean);
        // Trava de segurança: Aceita apenas range 0-100
        if (isNaN(num) || num < 0 || num > 100) return null;
        return num;
    },

    // --- CORE LOGIC ---
    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        // Recupera datas garantindo formato ISO YYYY-MM-DD (Timezone Safe)
        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📅 [NEXUS] Query Range: ${dataInicio} -> ${dataFim}`);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400"><i class="fas fa-satellite-dish fa-spin mr-2"></i> Sincronizando dados telemétricos...</td></tr>';

        try {
            // 1. Busca Paralela (Performance)
            const [resProd, resAudit, resUsers, resMetas] = await Promise.all([
                Sistema.supabase.from('producao').select('*').gte('data_referencia', dataInicio).lte('data_referencia', dataFim).range(0, 50000),
                Sistema.supabase.from('assertividade').select('usuario_id, porcentagem, auditora, data_auditoria').gte('data_auditoria', dataInicio).lte('data_auditoria', dataFim),
                Sistema.supabase.from('usuarios').select('id, nome, perfil, funcao, contrato').range(0, 5000),
                // Busca meta do mês referente à data de início para referência
                Sistema.supabase.from('metas').select('usuario_id, meta_producao').eq('mes', parseInt(dataInicio.split('-')[1])).eq('ano', parseInt(dataInicio.split('-')[0]))
            ]);

            if (resProd.error) throw resProd.error;
            if (resAudit.error) console.warn("[NEXUS] Aviso Auditoria:", resAudit.error);

            // 2. Indexação de Dados Auxiliares (O(1) Access)
            const mapaUsuarios = {}; resUsers.data.forEach(u => mapaUsuarios[u.id] = u);
            const mapaMetas = {}; if(resMetas.data) resMetas.data.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            // 3. Processamento de Auditoria (O Cálculo da "Média Samaria")
            // Agrupa as notas válidas por usuário
            const mapaAuditoria = {};     

            if (resAudit.data) {
                resAudit.data.forEach(a => {
                    const val = this.parsePercentage(a.porcentagem);
                    if (val === null) return; // Ignora lixo ou vazios (Silent Failure Prevention)

                    const uid = a.usuario_id;
                    if (!mapaAuditoria[uid]) mapaAuditoria[uid] = { soma: 0, qtd: 0, amostras: [] };
                    
                    mapaAuditoria[uid].soma += val;
                    mapaAuditoria[uid].qtd++;
                    // Opcional: Guardar amostras para debug profundo se necessário
                });
            }

            // 4. Agrupamento Unificado (Merge Sort Logic)
            let dadosAgrupados = {};

            // A) Processa Produção (Volume)
            resProd.data.forEach(item => {
                const uid = item.usuario_id;
                if(!dadosAgrupados[uid]) this.inicializarUsuario(dadosAgrupados, uid, mapaUsuarios, mapaMetas, mapaAuditoria);
                
                const d = dadosAgrupados[uid];
                const status = (item.status || '').toUpperCase();
                
                // Classificação de Status (Type-Safety Manual)
                const isOk = ['OK', 'VALIDO', 'REV', 'PROCESSADO', 'CONCLUIDO', 'SUCESSO'].some(s => status.includes(s));
                const isNok = status.includes('NOK') || status.includes('ERRO');
                const isNeutro = this.statusNeutros.some(s => status.includes(s));
                
                // Volume considera tudo que teve esforço produtivo
                let contaVolume = isOk || isNok || (isNeutro && item.auditora);

                if (contaVolume) {
                    d.totais.qty += (Number(item.quantidade) || 0);
                    d.totais.fifo += (Number(item.fifo) || 0);
                    d.totais.gt += (Number(item.gradual_total) || 0);
                    d.totais.gp += (Number(item.gradual_parcial) || 0);
                    
                    const fator = parseFloat(item.fator);
                    if (!isNaN(fator)) d.totais.diasUteis += fator;
                }
                
                d.registros.push({ ...item, usuario: d.usuario, is_neutro: isNeutro });
            });

            // B) Adiciona quem tem Auditoria mas não tem Produção no período (Edge Case)
            Object.keys(mapaAuditoria).forEach(uid => {
                if (!dadosAgrupados[uid]) this.inicializarUsuario(dadosAgrupados, uid, mapaUsuarios, mapaMetas, mapaAuditoria);
            });

            this.dadosOriginais = Object.values(dadosAgrupados);
            
            // Aplica filtro visual se houver seleção prévia
            const filtroNome = document.getElementById('selected-name')?.textContent;
            if (this.usuarioSelecionado && filtroNome) {
                this.filtrarUsuario(this.usuarioSelecionado, filtroNome);
            } else {
                this.renderizarTabela();
                this.atualizarKPIsGlobal(this.dadosOriginais);
            }

        } catch (error) { 
            console.error("[NEXUS] Critical Error:", error); 
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-rose-500 font-bold"><i class="fas fa-bug"></i> Falha no processamento: ${error.message}</td></tr>`; 
        }
    },

    inicializarUsuario: function(grupo, uid, mapaUsuarios, mapaMetas, mapaAuditoria) {
        const userObj = mapaUsuarios[uid] || { id: uid, nome: `ID: ${uid}`, funcao: 'ND', contrato: 'ND' };
        
        // Cálculo Atômico da Média
        let mediaFinal = 0;
        const audData = mapaAuditoria[uid];
        if (audData && audData.qtd > 0) {
            mediaFinal = audData.soma / audData.qtd;
        }

        grupo[uid] = {
            usuario: userObj, 
            registros: [],
            totais: { qty: 0, diasUteis: 0, fifo:0, gt:0, gp:0 },
            meta_real: mapaMetas[uid] || 650, // Fallback safe
            auditoria: { 
                media: mediaFinal, 
                qtd: audData ? audData.qtd : 0,
                soma: audData ? audData.soma : 0
            }
        };
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const mostrarGestao = document.getElementById('check-gestao')?.checked;
        
        // Filtra a lista para exibição
        let lista = this.usuarioSelecionado 
            ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) 
            : this.dadosOriginais;

        if (!mostrarGestao && !this.usuarioSelecionado) {
            lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        }

        tbody.innerHTML = '';
        if(lista.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado para o filtro atual.</td></tr>'; 
            this.setTxt('total-registros-footer', 0);
            return; 
        }

        // Ordenação Alfabética
        lista.sort((a,b) => (a.usuario.nome||'').localeCompare(b.usuario.nome||''));

        let html = '';
        lista.forEach(d => {
            // Formatação de Exibição
            const metaDia = d.meta_real; 
            const atingimento = metaDia > 0 ? (d.totais.qty / (metaDia * (d.totais.diasUteis || 1))) * 100 : 0;
            
            // Tratamento da Assertividade (A Lógica que você pediu)
            let assertDisplay = "-";
            let corAssert = "text-slate-300";
            let tooltipAssert = "Sem auditorias no período";

            if (d.auditoria.qtd > 0) {
                const valor = d.auditoria.media;
                assertDisplay = valor.toFixed(2).replace('.', ',') + "%";
                tooltipAssert = `Baseado em ${d.auditoria.qtd} documentos auditados (Soma: ${d.auditoria.soma})`;
                
                if (valor >= 98) corAssert = "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
                else if (valor >= 95) corAssert = "text-blue-700 font-bold bg-blue-50 border-blue-200";
                else if (valor >= 90) corAssert = "text-amber-700 font-bold bg-amber-50 border-amber-200";
                else corAssert = "text-rose-700 font-bold bg-rose-50 border-rose-200";
            }

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 group text-xs text-slate-600">
                <td class="px-2 py-3 text-center bg-slate-50/30">
                    <input type="checkbox" class="check-user cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500" value="${d.usuario.id}">
                </td>
                <td class="px-2 py-3 text-center">
                    <button onclick="Produtividade.Geral.mudarFator('${d.usuario.id}', 0)" class="text-[10px] font-bold text-slate-400 hover:text-rose-500 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-white transition" title="Zerar Fator (Abono)">AB</button>
                </td>
                <td class="px-3 py-3 font-bold text-slate-700 group-hover:text-blue-600 transition cursor-pointer flex flex-col" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                    <span class="truncate" title="${d.usuario.nome}">${d.usuario.nome}</span>
                    <span class="text-[9px] text-slate-400 font-normal uppercase tracking-wider">${d.usuario.funcao || 'N/A'}</span>
                </td>
                <td class="px-2 py-3 text-center font-mono">${d.totais.diasUteis.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.fifo}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gt}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gp}</td>
                
                <td class="px-2 py-3 text-center bg-slate-50/50 text-slate-400 font-mono">${metaDia}</td>
                <td class="px-2 py-3 text-center font-bold text-slate-600 bg-slate-50/50">${(metaDia * d.totais.diasUteis).toLocaleString('pt-BR')}</td>
                
                <td class="px-2 py-3 text-center font-black text-blue-700 bg-blue-50/30 border-x border-blue-100 text-sm shadow-sm">
                    ${d.totais.qty.toLocaleString('pt-BR')}
                </td>
                <td class="px-2 py-3 text-center font-bold ${atingimento >= 100 ? 'text-emerald-600' : 'text-slate-500'}">
                    ${atingimento.toFixed(1)}%
                </td>
                
                <td class="px-2 py-3 text-center border-l border-slate-100">
                    <div class="inline-block px-2 py-1 rounded border ${corAssert} shadow-sm cursor-help" title="${tooltipAssert}">
                        ${assertDisplay}
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        this.setTxt('total-registros-footer', lista.length);
    },

    // --- FILTRAGEM E INTERATIVIDADE (UX) ---
    filtrarUsuario: function(id, nome) {
        this.usuarioSelecionado = id;
        
        // Atualiza UI do Header
        const header = document.getElementById('selection-header');
        const nameSpan = document.getElementById('selected-name');
        if(header && nameSpan) {
            header.classList.remove('hidden');
            header.classList.add('flex');
            nameSpan.innerText = nome;
        }

        this.renderizarTabela();
        
        // Recalcula KPIs apenas para esse usuário
        const dadosUser = this.dadosOriginais.filter(d => d.usuario.id == id);
        this.atualizarKPIsGlobal(dadosUser);
    },

    limparSelecao: function() {
        this.usuarioSelecionado = null;
        document.getElementById('selection-header').classList.add('hidden');
        document.getElementById('selection-header').classList.remove('flex');
        
        this.renderizarTabela();
        this.atualizarKPIsGlobal(this.dadosOriginais);
    },

    // --- KPIS (Dashboards) ---
    atualizarKPIsGlobal: function(dados) {
        let totalProd = 0, totalMeta = 0, diasUteis = 0;
        let somaMediaAssert = 0, countAssert = 0;

        dados.forEach(d => {
            // Ignora Gestão nos KPIs Globais para não distorcer a média operacional
            if (['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())) return;

            totalProd += d.totais.qty;
            totalMeta += (d.meta_real * d.totais.diasUteis);
            diasUteis += d.totais.diasUteis;

            if (d.auditoria.qtd > 0) {
                somaMediaAssert += d.auditoria.media;
                countAssert++;
            }
        });

        // Volume
        this.setTxt('kpi-validacao-real', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-validacao-esperado', totalMeta.toLocaleString('pt-BR'));
        const barVol = document.getElementById('bar-volume');
        if(barVol) barVol.style.width = totalMeta > 0 ? Math.min((totalProd/totalMeta)*100, 100) + '%' : '0%';

        // Assertividade Global (Média das Médias)
        const mediaGlobalAssert = countAssert > 0 ? (somaMediaAssert / countAssert) : 0;
        this.setTxt('kpi-meta-assertividade-val', mediaGlobalAssert.toFixed(2).replace('.', ',') + '%');
        this.setTxt('kpi-meta-producao-val', totalMeta > 0 ? ((totalProd/totalMeta)*100).toFixed(1) + '%' : '0%');

        // Capacidade (Exemplo: 17 assistentes ativos é o ideal)
        const ativos = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())).length;
        this.setTxt('kpi-capacidade-info', `${ativos}/17`); // 17 é hardcoded como base operacional, pode virar config
        const capPct = (ativos / 17) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(capPct) + '%');
        const barCap = document.getElementById('bar-capacidade');
        if(barCap) barCap.style.width = Math.min(capPct, 100) + '%';

        // Velocidade
        const mediaDia = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;
        this.setTxt('kpi-media-real', mediaDia);
        this.setTxt('kpi-media-esperada', '650'); // Meta Base
        this.setTxt('kpi-dias-uteis', diasUteis.toFixed(1));

        // Top Lists
        this.renderTopLists(dados);
    },

    renderTopLists: function(dados) {
        const op = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        
        // Top Produção
        const topProd = [...op].sort((a,b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const listProd = document.getElementById('top-prod-list');
        if(listProd) {
            listProd.innerHTML = topProd.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-slate-600">${u.totais.qty}</span></div>`).join('');
        }

        // Top Assertividade (Mínimo 1 auditoria)
        const topAssert = [...op].filter(u => u.auditoria.qtd > 0).sort((a,b) => b.auditoria.media - a.auditoria.media).slice(0, 3);
        const listAssert = document.getElementById('top-assert-list');
        if(listAssert) {
            listAssert.innerHTML = topAssert.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-emerald-600">${u.auditoria.media.toFixed(1)}%</span></div>`).join('');
        }
    },

    // --- ACTIONS ---
    toggleAll: function(checked) {
        document.querySelectorAll('.check-user').forEach(c => c.checked = checked);
    },

    mudarFator: async function(uid, valor) {
        if(!confirm("Alterar o fator de dias úteis para este usuário?")) return;
        // Implementar lógica de update no banco se necessário, 
        // ou apenas update visual local se for algo volátil.
        // Por padrão no sistema Nexus, alterações de fator exigem persistência na tabela 'producao'.
        alert("Funcionalidade requer update na tabela de produção (campo fator). Implementar rota RPC.");
    },

    excluirDadosDia: async function() {
        const dt = document.getElementById('sel-data-dia').value;
        if (!dt) return alert("Selecione um dia.");
        if (!confirm(`TEM CERTEZA? Isso apagará TODA a produção do dia ${dt}.\nEssa ação é irreversível.`)) return;

        const { error } = await Sistema.supabase.from('producao').delete().eq('data_referencia', dt);
        if(error) alert("Erro: " + error.message);
        else { alert("Dados excluídos."); this.carregarTela(); }
    }
};