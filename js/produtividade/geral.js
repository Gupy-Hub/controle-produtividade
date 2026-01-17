window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    usuarioSelecionado: null,
    diasAtivosGlobal: 1, // Novo: Armazena quantos dias a operação rodou

    init: function() { 
        console.log("🚀 [NEXUS] Produtividade: Engine V17 (KPI Velocidade Real)...");
        this.carregarTela(); 
        this.initialized = true; 
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        const datas = Produtividade.getDatasFiltro();
        const dataInicio = datas.inicio;
        const dataFim = datas.fim;

        console.log(`📡 [NEXUS] RPC Request: ${dataInicio} -> ${dataFim}`);
        
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-12"><i class="fas fa-server fa-pulse text-emerald-500"></i> Carregando dados...</td></tr>`;

        try {
            // 1. Busca os Dados Detalhados
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: dataInicio, 
                    data_fim: dataFim 
                });

            if (error) throw error;

            // 2. CORREÇÃO: Busca o número real de dias de operação (Dias Distintos)
            const { data: diasReais, error: errDias } = await Sistema.supabase
                .rpc('get_dias_ativos', {
                    data_inicio: dataInicio,
                    data_fim: dataFim
                });
            
            // Se der erro ou for 0, assume 1 para evitar divisão por zero
            this.diasAtivosGlobal = (diasReais && diasReais > 0) ? diasReais : 1;
            console.log(`📅 Dias de Operação Ativa: ${this.diasAtivosGlobal}`);

            console.log(`✅ [NEXUS] Dados recebidos: ${data.length} registros.`);

            this.dadosOriginais = data.map(row => ({
                usuario: {
                    id: row.usuario_id,
                    nome: row.nome,
                    funcao: row.funcao,
                    contrato: row.contrato
                },
                meta_real: row.meta_producao,
                meta_assertividade: row.meta_assertividade,
                totais: {
                    qty: row.total_qty,
                    diasUteis: row.total_dias_uteis,
                    fifo: row.total_fifo,
                    gt: row.total_gt,
                    gp: row.total_gp
                },
                auditoria: {
                    qtd: row.qtd_auditorias,
                    soma: row.soma_auditorias
                }
            }));
            
            const filtroNome = document.getElementById('selected-name')?.textContent;
            if (this.usuarioSelecionado && filtroNome) {
                this.filtrarUsuario(this.usuarioSelecionado, filtroNome);
            } else {
                this.renderizarTabela();
                this.atualizarKPIsGlobal(this.dadosOriginais);
            }

        } catch (error) { 
            console.error("[NEXUS] RPC Error:", error); 
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-rose-500 font-bold">Erro: ${error.message}</td></tr>`; 
        }
    },

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
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro de atividade neste período.</td></tr>'; 
            this.setTxt('total-registros-footer', 0);
            return; 
        }

        lista.sort((a,b) => (a.usuario.nome||'').localeCompare(b.usuario.nome||''));

        const htmlParts = lista.map(d => {
            const metaDia = d.meta_real; 
            const atingimento = (metaDia > 0 && d.totais.diasUteis > 0) 
                ? (d.totais.qty / (metaDia * d.totais.diasUteis)) * 100 
                : 0;
            
            const corProducao = atingimento >= 100 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold';
            const corProducaoBg = atingimento >= 100 ? 'bg-emerald-50' : 'bg-rose-50';

            const htmlAssertividade = window.Produtividade.Assertividade 
                ? Produtividade.Assertividade.renderizarCelula(d.auditoria, d.meta_assertividade)
                : '-';

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
                <td class="px-2 py-3 text-center ${corProducao} ${corProducaoBg}">
                    ${atingimento.toFixed(1)}%
                </td>
                <td class="px-2 py-3 text-center border-l border-slate-100">
                    ${htmlAssertividade}
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
        
        // Se filtrou um usuário, recalculamos os dias ativos baseado só nele?
        // Geralmente KPIs globais devem refletir o filtro.
        // Se eu filtro a Samaria, quero ver a média da Samaria ou do Time?
        // Geralmente do contexto. Vamos manter a lógica Global para o Time, 
        // e se filtrar, recalcula para o usuário.
        this.atualizarKPIsGlobal(dadosUser, true); 
    },

    limparSelecao: function() {
        this.usuarioSelecionado = null;
        document.getElementById('selection-header').classList.add('hidden');
        document.getElementById('selection-header').classList.remove('flex');
        this.renderizarTabela();
        this.atualizarKPIsGlobal(this.dadosOriginais, false);
    },

    atualizarKPIsGlobal: function(dados, isFiltrado) {
        let totalProd = 0, totalMeta = 0;
        let somaNotasGlobal = 0, qtdAuditoriasGlobal = 0;
        
        // Se estiver filtrado (um usuário), usamos os dias dele.
        // Se for global, usamos os dias globais da operação (this.diasAtivosGlobal)
        let divisorDias = this.diasAtivosGlobal;

        dados.forEach(d => {
            if (['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())) return;

            totalProd += Number(d.totais.qty);
            totalMeta += (Number(d.meta_real) * Number(d.totais.diasUteis));
            
            // Se estiver filtrando um usuário, somamos os dias dele para usar de divisor
            if (isFiltrado) {
                // Num filtro de usuário único, o divisor é a soma dos dias dele (simples)
                // Mas como o forEach roda só pra ele, podemos pegar direto d.totais.diasUteis no final
            }

            somaNotasGlobal += Number(d.auditoria.soma || 0);
            qtdAuditoriasGlobal += Number(d.auditoria.qtd || 0);
        });

        // Ajuste do Divisor de Dias para o KPI de Velocidade
        if (isFiltrado && dados.length > 0) {
            // Se tem um usuário só, a velocidade é Total / Dias Que Ele Trabalhou
            const user = dados[0]; // Pega o primeiro (e único)
            divisorDias = user.totais.diasUteis > 0 ? user.totais.diasUteis : 1;
        }

        // 1. KPI VALIDAÇÃO REAL
        this.setTxt('kpi-validacao-real', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-validacao-esperado', totalMeta.toLocaleString('pt-BR'));
        
        const barVol = document.getElementById('bar-volume');
        if(barVol) barVol.style.width = totalMeta > 0 ? Math.min((totalProd/totalMeta)*100, 100) + '%' : '0%';

        // 2. KPI ASSERTIVIDADE
        const mediaGlobalAssert = qtdAuditoriasGlobal > 0 ? (somaNotasGlobal / qtdAuditoriasGlobal) : 0;
        this.setTxt('kpi-meta-assertividade-val', mediaGlobalAssert.toFixed(2).replace('.', ',') + '%');
        
        // 3. KPI META PRODUÇÃO (%)
        this.setTxt('kpi-meta-producao-val', totalMeta > 0 ? ((totalProd/totalMeta)*100).toFixed(1) + '%' : '0%');

        // 4. KPI CAPACIDADE
        const ativos = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase())).length;
        this.setTxt('kpi-capacidade-info', `${ativos}/17`); // 17 é fixo ou dinâmico? Mantive fixo como no original
        const capPct = (ativos / 17) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(capPct) + '%');
        const barCap = document.getElementById('bar-capacidade');
        if(barCap) barCap.style.width = Math.min(capPct, 100) + '%';

        // 5. KPI VELOCIDADE MÉDIA (MÉDIA / DIA) - O FIX
        // Fórmula: Produção Total / Dias de Operação (Calendário Ativo)
        const velocidadeMedia = divisorDias > 0 ? Math.round(totalProd / divisorDias) : 0;
        
        this.setTxt('kpi-media-real', velocidadeMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias-uteis', divisorDias); // Mostra o divisor usado no label "Dias"

        this.renderTopLists(dados);
    },

    renderTopLists: function(dados) {
        // Filtra gestores fora do ranking
        const op = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        
        // Top Produção
        const topProd = [...op].sort((a,b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const listProd = document.getElementById('top-prod-list');
        if(listProd) listProd.innerHTML = topProd.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-slate-600">${Number(u.totais.qty).toLocaleString('pt-BR')}</span></div>`).join('');

        // Top Assertividade
        const topAssert = [...op]
            .map(u => ({ ...u, mediaCalc: u.auditoria.qtd > 0 ? (u.auditoria.soma / u.auditoria.qtd) : 0 }))
            .filter(u => u.auditoria.qtd > 0)
            .sort((a,b) => b.mediaCalc - a.mediaCalc)
            .slice(0, 3);
            
        const listAssert = document.getElementById('top-assert-list');
        if(listAssert) listAssert.innerHTML = topAssert.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-emerald-600">${u.mediaCalc.toFixed(1)}%</span></div>`).join('');
    },
    
    toggleAll: function(checked) {
        document.querySelectorAll('.check-user').forEach(c => c.checked = checked);
    },

    mudarFator: async function(uid, valor) {
        // Implementação futura
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