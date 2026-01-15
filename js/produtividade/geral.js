window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    usuarioSelecionado: null,

    init: function() { 
        console.log("🚀 [NEXUS] Produtividade: Engine V14 (Server-Side SQL)...");
        this.carregarTela(); 
        this.initialized = true; 
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },

    // --- NOVA ENGINE: CHAMADA RPC (ULTRA RÁPIDA) ---
    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📡 [NEXUS] RPC Request: ${dataInicio} -> ${dataFim}`);
        
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-12 text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <i class="fas fa-server fa-pulse text-2xl text-emerald-500"></i>
                        <span class="font-bold text-slate-600">Calculando no Servidor...</span>
                        <span class="text-xs font-mono text-slate-400">Database Aggregation</span>
                    </div>
                </td>
            </tr>`;

        try {
            // AQUI ESTÁ A MÁGICA: Uma única chamada resolve tudo.
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: dataInicio, 
                    data_fim: dataFim 
                });

            if (error) throw error;

            console.log(`✅ [NEXUS] Dados recebidos: ${data.length} registros processados.`);

            // Adaptador para manter compatibilidade com o layout existente
            // Convertemos o formato "Flat" do SQL para o formato "Aninhado" que o renderizador usa
            this.dadosOriginais = data.map(row => ({
                usuario: {
                    id: row.usuario_id,
                    nome: row.nome,
                    funcao: row.funcao,
                    contrato: row.contrato
                },
                meta_real: row.meta_producao,
                totais: {
                    qty: row.total_qty,
                    diasUteis: row.total_dias_uteis,
                    fifo: row.total_fifo,
                    gt: row.total_gt,
                    gp: row.total_gp
                },
                auditoria: {
                    media: row.media_assertividade,
                    qtd: row.qtd_auditorias,
                    soma: row.soma_auditorias
                }
            }));
            
            // Fluxo padrão de UI
            const filtroNome = document.getElementById('selected-name')?.textContent;
            if (this.usuarioSelecionado && filtroNome) {
                this.filtrarUsuario(this.usuarioSelecionado, filtroNome);
            } else {
                this.renderizarTabela();
                this.atualizarKPIsGlobal(this.dadosOriginais);
            }

        } catch (error) { 
            console.error("[NEXUS] RPC Error:", error); 
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-rose-500 font-bold"><i class="fas fa-database"></i> Erro no Banco de Dados: ${error.message}</td></tr>`; 
        }
    },

    // --- RENDERIZAÇÃO (Mantida Igual para preservar o visual) ---
    renderizarTabela: function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const mostrarGestao = document.getElementById('check-gestao')?.checked;
        
        let lista = this.usuarioSelecionado 
            ? this.dadosOriginais.filter(d => d.usuario.id == this.usuarioSelecionado) 
            : this.dadosOriginais;

        if (!mostrarGestao && !this.usuarioSelecionado) {
            lista = lista.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        }

        tbody.innerHTML = '';
        if(lista.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>'; 
            this.setTxt('total-registros-footer', 0);
            return; 
        }

        lista.sort((a,b) => (a.usuario.nome||'').localeCompare(b.usuario.nome||''));

        const htmlParts = lista.map(d => {
            const metaDia = d.meta_real; 
            // Proteção contra divisão por zero
            const atingimento = (metaDia > 0 && d.totais.diasUteis > 0) 
                ? (d.totais.qty / (metaDia * d.totais.diasUteis)) * 100 
                : 0;
            
            let assertDisplay = "-";
            let corAssert = "text-slate-300 border-slate-100 bg-slate-50"; 
            let tooltipAssert = "Sem auditorias";

            if (d.auditoria.qtd > 0) {
                const valor = d.auditoria.media;
                assertDisplay = valor.toFixed(2).replace('.', ',') + "%";
                tooltipAssert = `${d.auditoria.qtd} auditorias | Soma: ${d.auditoria.soma}`;
                
                if (valor >= 98) corAssert = "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
                else if (valor >= 95) corAssert = "text-blue-700 font-bold bg-blue-50 border-blue-200";
                else if (valor >= 90) corAssert = "text-amber-700 font-bold bg-amber-50 border-amber-200";
                else corAssert = "text-rose-700 font-bold bg-rose-50 border-rose-200";
            }

            return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 group text-xs text-slate-600">
                <td class="px-2 py-3 text-center bg-slate-50/30">
                    <input type="checkbox" class="check-user cursor-pointer" value="${d.usuario.id}">
                </td>
                <td class="px-2 py-3 text-center">
                    <button onclick="Produtividade.Geral.mudarFator('${d.usuario.id}', 0)" class="text-[10px] font-bold text-slate-400 hover:text-rose-500 border border-slate-200 rounded px-1 py-0.5 hover:bg-white" title="Zerar Fator">AB</button>
                </td>
                <td class="px-3 py-3 font-bold text-slate-700 group-hover:text-blue-600 transition cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                    <div class="flex flex-col">
                        <span class="truncate" title="${d.usuario.nome}">${d.usuario.nome}</span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">${d.usuario.funcao || 'ND'}</span>
                    </div>
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
                    <div class="inline-block px-2 py-1 rounded border ${corAssert} shadow-sm cursor-help select-none" title="${tooltipAssert}">
                        ${assertDisplay}
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = htmlParts.join('');
        this.setTxt('total-registros-footer', lista.length);
    },

    filtrarUsuario: function(id, nome) {
        this.usuarioSelecionado = id;
        const header = document.getElementById('selection-header');
        const nameSpan = document.getElementById('selected-name');
        if(header && nameSpan) {
            header.classList.remove('hidden');
            header.classList.add('flex');
            nameSpan.innerText = nome;
        }
        this.renderizarTabela();
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

    atualizarKPIsGlobal: function(dados) {
        let totalProd = 0, totalMeta = 0, diasUteis = 0;
        let somaMediaAssert = 0, countAssert = 0;

        dados.forEach(d => {
            if (['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())) return;

            totalProd += Number(d.totais.qty);
            totalMeta += (Number(d.meta_real) * Number(d.totais.diasUteis));
            diasUteis += Number(d.totais.diasUteis);

            if (d.auditoria.qtd > 0) {
                somaMediaAssert += Number(d.auditoria.media);
                countAssert++;
            }
        });

        this.setTxt('kpi-validacao-real', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-validacao-esperado', totalMeta.toLocaleString('pt-BR'));
        
        const barVol = document.getElementById('bar-volume');
        if(barVol) barVol.style.width = totalMeta > 0 ? Math.min((totalProd/totalMeta)*100, 100) + '%' : '0%';

        const mediaGlobalAssert = countAssert > 0 ? (somaMediaAssert / countAssert) : 0;
        this.setTxt('kpi-meta-assertividade-val', mediaGlobalAssert.toFixed(2).replace('.', ',') + '%');
        this.setTxt('kpi-meta-producao-val', totalMeta > 0 ? ((totalProd/totalMeta)*100).toFixed(1) + '%' : '0%');

        const ativos = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())).length;
        this.setTxt('kpi-capacidade-info', `${ativos}/17`);
        const capPct = (ativos / 17) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(capPct) + '%');
        const barCap = document.getElementById('bar-capacidade');
        if(barCap) barCap.style.width = Math.min(capPct, 100) + '%';

        const mediaDia = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;
        this.setTxt('kpi-media-real', mediaDia);
        this.setTxt('kpi-dias-uteis', diasUteis.toFixed(1));

        this.renderTopLists(dados);
    },

    renderTopLists: function(dados) {
        const op = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        
        const topProd = [...op].sort((a,b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const listProd = document.getElementById('top-prod-list');
        if(listProd) listProd.innerHTML = topProd.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-slate-600">${Number(u.totais.qty).toLocaleString('pt-BR')}</span></div>`).join('');

        const topAssert = [...op].filter(u => u.auditoria.qtd > 0).sort((a,b) => b.auditoria.media - a.auditoria.media).slice(0, 3);
        const listAssert = document.getElementById('top-assert-list');
        if(listAssert) listAssert.innerHTML = topAssert.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-emerald-600">${Number(u.auditoria.media).toFixed(1)}%</span></div>`).join('');
    },

    toggleAll: function(checked) {
        document.querySelectorAll('.check-user').forEach(c => c.checked = checked);
    },

    mudarFator: async function(uid, valor) {
        // Exemplo: Sistema.supabase.rpc('update_fator_usuario', { p_usuario_id: uid, p_data: ..., p_valor: valor });
        alert("Necessário implementar RPC de Update no banco.");
    },

    excluirDadosDia: async function() {
        const dt = document.getElementById('sel-data-dia').value;
        if (!dt) return alert("Selecione um dia.");
        if (!confirm(`TEM CERTEZA? Isso apagará TODA a produção de ${dt}.`)) return;

        const { error } = await Sistema.supabase.from('producao').delete().eq('data_referencia', dt);
        if(error) alert("Erro: " + error.message);
        else { alert("Dados excluídos."); this.carregarTela(); }
    }
};