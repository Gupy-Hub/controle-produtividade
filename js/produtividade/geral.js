window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    cacheData: [],      
    cacheDatas: { start: null, end: null }, 
    usuarioSelecionado: null,
    selecionados: new Set(),
    
    // Lista de Feriados
    feriados: {
        "2025": ["01-01", "03-03", "03-04", "04-18", "04-21", "05-01", "06-19", "07-09", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"],
        "2026": ["01-01", "02-17", "02-18", "04-03", "04-21", "05-01", "06-04", "07-09", "09-07", "10-12", "11-02", "11-15", "11-20", "12-24", "12-25", "12-31"]
    },
    
    // Status que contam como produção mesmo sem OK/NOK (Se tiver auditoria)
    statusNeutros: ['DUPL', 'EMPR', 'IA', 'NA', 'N/A', 'REVALIDA', 'CANCELADO'],

    init: function() { 
        console.log("🔧 Produtividade: Iniciando (V8 - Pure Math Logic)...");
        this.carregarTela(); 
        this.initialized = true; 
    },
    
    setTxt: function(id, valor) { const el = document.getElementById(id); if (el) el.innerText = valor; },
    setHtml: function(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; },
    getFator: function(val) { return (val === null || val === undefined || val === "") ? 1 : parseFloat(val); },

    isDiaUtil: function(dateObj) {
        const day = dateObj.getDay();
        if (day === 0 || day === 6) return false; 
        const chave = `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        return !(this.feriados[dateObj.getFullYear()] || []).includes(chave);
    },

    getDiasUteisNoMes: function(ano, mes) {
        let dias = 0; const date = new Date(ano, mes - 1, 1);
        while (date.getMonth() === mes - 1) { if (this.isDiaUtil(date)) dias++; date.setDate(date.getDate() + 1); }
        return dias;
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📅 Buscando dados de ${dataInicio} até ${dataFim}`);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-10 text-slate-400"><i class="fas fa-bolt fa-spin mr-2"></i> Processando dados...</td></tr>';

        try {
            // 1. Busca Produção
            const { data: producao, error: errProd } = await Sistema.supabase.from('producao').select('*').gte('data_referencia', dataInicio).lte('data_referencia', dataFim).range(0, 50000);
            if (errProd) throw errProd;

            // 2. Busca Auditorias (Assertividade)
            const { data: auditorias, error: errAudit } = await Sistema.supabase.from('assertividade').select('usuario_id, porcentagem, auditora, data_auditoria').gte('data_auditoria', dataInicio).lte('data_auditoria', dataFim);
            if (errAudit) console.warn("Erro Assertividade:", errAudit);

            // 3. Processamento PURO da Assertividade (Ignora Status, só vê número)
            const mapaAuditoria = {};     
            const mapaAuditoriaDia = {}; 

            if (auditorias) {
                auditorias.forEach(a => {
                    // Limpeza e Validação Numérica
                    let raw = a.porcentagem;
                    if (raw == null || raw === '') return;
                    let val = parseFloat(String(raw).replace('%', '').replace(',', '.').trim());
                    
                    // REGRA DE OURO: Se é número entre 0 e 100, ENTRA NA CONTA.
                    if (isNaN(val) || val < 0 || val > 100) return; 

                    const uid = a.usuario_id;
                    if (!mapaAuditoria[uid]) mapaAuditoria[uid] = { soma: 0, qtd: 0 };
                    mapaAuditoria[uid].soma += val;
                    mapaAuditoria[uid].qtd++;

                    const keyDia = `${uid}_${a.data_auditoria}`; 
                    if (!mapaAuditoriaDia[keyDia]) mapaAuditoriaDia[keyDia] = { soma: val, qtd: 1 };
                    else { mapaAuditoriaDia[keyDia].soma += val; mapaAuditoriaDia[keyDia].qtd++; }
                });
            }

            // 4. Usuários e Metas
            const { data: usuarios } = await Sistema.supabase.from('usuarios').select('id, nome, perfil, funcao, contrato').range(0, 5000);
            const mapaUsuarios = {}; usuarios.forEach(u => mapaUsuarios[u.id] = u);
            
            const [anoRef, mesRef] = dataInicio.split('-');
            const { data: metasBanco } = await Sistema.supabase.from('metas').select('usuario_id, meta_producao').eq('mes', parseInt(mesRef)).eq('ano', parseInt(anoRef));
            const mapaMetas = {}; if(metasBanco) metasBanco.forEach(m => mapaMetas[m.usuario_id] = m.meta_producao);

            // 5. Agrupamento (Merge)
            let dadosAgrupados = {};
            
            // A) Processa Volume (Aqui olhamos Status para saber se produziu)
            producao.forEach(item => {
                const uid = item.usuario_id;
                if(!dadosAgrupados[uid]) this.criarEntradaUsuario(dadosAgrupados, uid, mapaUsuarios, mapaMetas, mapaAuditoria, mapaAuditoriaDia);
                
                const d = dadosAgrupados[uid];
                const status = (item.status || '').toUpperCase();
                
                // Regras de Volume (Quantidade)
                const isOk = ['OK', 'VALIDO', 'REV', 'PROCESSADO', 'CONCLUIDO', 'SUCESSO'].some(s => status.includes(s));
                const isNok = status.includes('NOK') || status.includes('ERRO');
                const isNeutro = this.statusNeutros.some(s => status.includes(s));
                
                let contaVolume = isOk || isNok || (isNeutro && item.auditora);

                if (contaVolume) {
                    d.totais.qty += (Number(item.quantidade) || 0);
                    // ... outros contadores ...
                    d.totais.diasUteis += this.getFator(item.fator);
                }
                
                if (contaVolume || isOk || isNok || isNeutro) {
                    d.registros.push({ ...item, usuario: d.usuario, is_neutro: isNeutro });
                }
            });

            // B) Adiciona quem só tem Assertividade (Mesmo sem produção)
            Object.keys(mapaAuditoria).forEach(uid => {
                if (!dadosAgrupados[uid]) this.criarEntradaUsuario(dadosAgrupados, uid, mapaUsuarios, mapaMetas, mapaAuditoria, mapaAuditoriaDia);
            });

            this.dadosOriginais = Object.values(dadosAgrupados);
            this.usuarioSelecionado ? this.filtrarUsuario(this.usuarioSelecionado, document.getElementById('selected-name')?.textContent) : (this.renderizarTabela(), this.atualizarKPIs(this.dadosOriginais));

        } catch (error) { console.error(error); tbody.innerHTML = `<tr><td colspan="12" class="text-center text-red-500">${error.message}</td></tr>`; }
    },

    criarEntradaUsuario: function(grupo, uid, mapaUsuarios, mapaMetas, mapaAuditoria, mapaAuditoriaDia) {
        const userObj = mapaUsuarios[uid] || { id: uid, nome: `ID: ${uid}`, funcao: 'ND', contrato: 'ND' };
        grupo[uid] = {
            usuario: userObj, registros: [], diasProcessados: new Set(),
            totais: { qty: 0, diasUteis: 0, fifo:0, gt:0, gp:0, fc:0 },
            meta_real: mapaMetas[uid] || 0,
            auditoriaReal: mapaAuditoria[uid] || { soma: 0, qtd: 0 },
            auditoriaDiaMap: mapaAuditoriaDia, // Dados diários para o grid
            kpiMediaAssert: 0
        };
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;
        const mostrarGestao = document.getElementById('check-gestao')?.checked;
        let lista = this.usuarioSelecionado ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) : this.dadosOriginais;
        if (!mostrarGestao && !this.usuarioSelecionado) lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));

        tbody.innerHTML = '';
        if(lista.length === 0) { tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro.</td></tr>'; return; }

        lista.sort((a,b) => (a.usuario.nome||'').localeCompare(b.usuario.nome||''));

        lista.forEach(d => {
            // CÁLCULO DA MÉDIA (AQUI É A VERDADE)
            let assertDisplay = "-"; let corAssert = "text-slate-400";
            if (d.auditoriaReal && d.auditoriaReal.qtd > 0) {
                const media = d.auditoriaReal.soma / d.auditoriaReal.qtd;
                d.kpiMediaAssert = media;
                assertDisplay = media.toFixed(2).replace('.', ',') + "%";
                corAssert = media >= 98 ? 'text-emerald-700 font-bold' : media < 90 ? 'text-rose-600 font-bold' : 'text-slate-600 font-bold';
            }

            // ... Renderização das linhas (Tr) ...
            // (Mantive simplificado aqui, use o bloco completo anterior se precisar do HTML exato, 
            // mas o importante é que assertDisplay agora usa a média limpa calculada acima)
            
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="px-2 py-2 text-center text-xs ${corAssert}">${assertDisplay}</td>`; 
            // ... resto das colunas ...
            // No seu código real, mantenha o HTML completo da V7, apenas certifique-se que d.auditoriaReal é a fonte.
        });
        
        // Renderiza HTML completo da V7 (mantido para não quebrar layout)
        // ... (use o código da V7 para o conteúdo do forEach)
    },
    
    // ... funções auxiliares (toggleSelection, atualizarKPIs, etc) mantidas da V7 ...
    atualizarKPIs: function(dados) { /* ... Lógica da V7 ... */ },
    filtrarUsuario: function(id, nome) { /* ... */ },
    toggleSelection: function(id) { /* ... */ },
    mudarFator: async function(id, val) { /* ... */ }
};