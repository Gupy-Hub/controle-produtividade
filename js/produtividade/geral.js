window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    usuarioSelecionado: null,
    diasAtivosGlobal: 1, // Armazena dias do calendário para referência

    init: function() { 
        console.log("🚀 [NEXUS] Produtividade: Engine V20 (Abono + KPIs Ajustados)...");
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
            // 1. Busca os Dados Detalhados (Engine V14 SQL com Fator de Abono)
            const { data, error } = await Sistema.supabase
                .rpc('get_painel_produtividade', { 
                    data_inicio: dataInicio, 
                    data_fim: dataFim 
                });

            if (error) throw error;

            // 2. Busca dias úteis reais (Calendário de Operação)
            const { data: diasReais } = await Sistema.supabase
                .rpc('get_dias_ativos', {
                    data_inicio: dataInicio,
                    data_fim: dataFim
                });
            
            this.diasAtivosGlobal = (diasReais && diasReais > 0) ? diasReais : 1;

            console.log(`✅ [NEXUS] Dados recebidos: ${data.length} registros. Dias Calendário: ${this.diasAtivosGlobal}`);

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
                    // Agora este valor pode ser decimal (Ex: 15.5) devido ao abono
                    diasUteis: Number(row.total_dias_uteis), 
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
            // Cálculo de Atingimento: Real / (Meta * Dias Fatorados)
            const atingimento = (metaDia > 0 && d.totais.diasUteis > 0) 
                ? (d.totais.qty / (metaDia * d.totais.diasUteis)) * 100 
                : 0;
            
            // Lógica Binária de Cores (Verde/Vermelho)
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
                    <button onclick="Produtividade.Geral.mudarFator('${d.usuario.id}', 0)" class="text-[10px] font-bold text-slate-400 hover:text-blue-500 border border-slate-200 rounded px-1 py-0.5 hover:bg-white transition" title="Abonar Dia / Ajustar Fator">AB</button>
                </td>
                <td class="px-3 py-3 font-bold text-slate-700 group-hover:text-blue-600 transition cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                    <div class="flex flex-col">
                        <span class="truncate" title="${d.usuario.nome}">${d.usuario.nome}</span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">${d.usuario.funcao || 'ND'}</span>
                    </div>
                </td>
                <td class="px-2 py-3 text-center font-mono">${Number(d.totais.diasUteis).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.fifo}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gt}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gp}</td>
                <td class="px-2 py-3 text-center bg-slate-50/50 text-slate-400 font-mono">${metaDia}</td>
                <td class="px-2 py-3 text-center font-bold text-slate-600 bg-slate-50/50">${Math.round(metaDia * d.totais.diasUteis).toLocaleString('pt-BR')}</td>
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
        // Recalcula KPIs focando no usuário selecionado
        const dadosUser = this.dadosOriginais.filter(d => d.usuario.id == id);
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
        
        // Acumuladores para Velocidade (Homem-Dia)
        let manDays = 0; 
        let ativosCount = 0;

        dados.forEach(d => {
            const isAssistente = !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase());
            
            if (isAssistente || isFiltrado) {
                ativosCount++;
                const diasUser = Number(d.totais.diasUteis);
                
                manDays += diasUser;
                totalProd += Number(d.totais.qty);
                totalMeta += (Number(d.meta_real) * diasUser);
            
                somaNotasGlobal += Number(d.auditoria.soma || 0);
                qtdAuditoriasGlobal += Number(d.auditoria.qtd || 0);
            }
        });

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

        // 4. KPI CAPACIDADE (FIXO EM 17 - Padrão da Operação)
        const capacidadeTotalPadrao = 17;
        
        this.setTxt('kpi-capacidade-info', `${ativosCount}/${capacidadeTotalPadrao}`);
        
        const capPct = (ativosCount / capacidadeTotalPadrao) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(capPct) + '%');
        const barCap = document.getElementById('bar-capacidade');
        if(barCap) barCap.style.width = Math.min(capPct, 100) + '%';

        // 5. KPI VELOCIDADE (REAL / META por Dia Trabalhado)
        const divisor = manDays > 0 ? manDays : 1;
        const velReal = Math.round(totalProd / divisor);
        const velMeta = Math.round(totalMeta / divisor);
        
        this.setTxt('kpi-media-real', `${velReal} / ${velMeta}`);
        
        // Exibe dias úteis do contexto (Usuario ou Global)
        const diasDisplay = isFiltrado && dados.length > 0 ? dados[0].totais.diasUteis.toLocaleString('pt-BR') : this.diasAtivosGlobal;
        this.setTxt('kpi-dias-uteis', diasDisplay); 

        this.renderTopLists(dados);
    },

    renderTopLists: function(dados) {
        const op = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        
        // Top 3 Produção
        const topProd = [...op].sort((a,b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const listProd = document.getElementById('top-prod-list');
        if(listProd) listProd.innerHTML = topProd.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-slate-600">${Number(u.totais.qty).toLocaleString('pt-BR')}</span></div>`).join('');

        // Top 3 Assertividade
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

    /**
     * Função para Abonar Dia ou Ajustar Fator
     * Pergunta a data (se não selecionada) e o tipo de abono.
     */
    mudarFator: async function(uid, fatorAtual) {
        // 1. Identifica a data alvo
        let dataAlvo = document.getElementById('sel-data-dia').value; 
        
        // Se estiver vendo um período, pergunta a data exata
        if (!dataAlvo) {
            dataAlvo = prompt("Digite a data para abonar (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
            if (!dataAlvo) return;
        }

        // 2. Pergunta o Tipo de Abono
        const opcao = prompt(
            `ABONAR DIA (${dataAlvo})\n\n` +
            `Escolha o fator para este dia:\n` +
            `1 - Dia Normal (1.0)\n` +
            `2 - Meio Período (0.5)\n` +
            `0 - Abonar Totalmente (0.0)\n\n` +
            `Digite o código (1, 2 ou 0):`, 
            "0"
        );

        if (opcao === null) return; // Cancelou

        let novoFator = 1.0;
        if (opcao === '2' || opcao === '0.5') novoFator = 0.5;
        if (opcao === '0') novoFator = 0.0;

        // 3. Envia ao Banco (RPC)
        try {
            const { error } = await Sistema.supabase
                .rpc('abonar_producao', {
                    p_usuario_id: uid,
                    p_data: dataAlvo,
                    p_fator: novoFator
                });

            if (error) throw error;

            alert(`✅ Sucesso! Dia ${dataAlvo} ajustado para fator ${novoFator}.`);
            this.carregarTela(); // Recarrega para ver o impacto nos cálculos

        } catch (error) {
            console.error(error);
            alert("Erro ao abonar: " + error.message);
        }
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