// ARQUIVO: js/produtividade/geral.js
window.Produtividade = window.Produtividade || {};

Produtividade.Geral = {
    initialized: false,
    dadosOriginais: [], 
    usuarioSelecionado: null,
    diasAtivosGlobal: 0, 

    init: function() { 
        console.log("🚀 [GupyMesa] Produtividade: Engine V27 (Fix 400 - Metas Separadas)...");
        this.updateHeader(); 
        this.carregarTela(); 
        this.initialized = true; 
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; },

    updateHeader: function() {
        const thAction = document.querySelector('thead tr th:nth-child(2)');
        if (thAction) {
            thAction.innerHTML = `
                <button onclick="Produtividade.Geral.abonarEmMassa()" 
                    class="bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300 rounded px-2 py-1 text-[10px] font-bold shadow-sm transition w-full flex justify-center items-center gap-1" 
                    title="Aplicar Abono/Fator para todos os selecionados">
                    <i class="fas fa-users-cog"></i> Massa
                </button>
            `;
        } else {
            setTimeout(() => this.updateHeader(), 1000);
        }
    },

    resetarKPIs: function() {
        this.setTxt('kpi-validacao-real', '...');
        this.setTxt('kpi-validacao-esperado', '...');
        this.setTxt('kpi-meta-assertividade-val', '...');
        this.setTxt('kpi-meta-producao-val', '...');
        this.setTxt('kpi-capacidade-pct', '...');
        this.setTxt('kpi-capacidade-info', '...');
        this.setTxt('kpi-media-real', '...');
        this.setTxt('kpi-media-esperada', '...');
        this.setTxt('kpi-dias-uteis', '...');
        const barVol = document.getElementById('bar-volume'); if(barVol) barVol.style.width = '0%';
        const barCap = document.getElementById('bar-capacidade'); if(barCap) barCap.style.width = '0%';
        const listProd = document.getElementById('top-prod-list'); if(listProd) listProd.innerHTML = '<span class="text-[10px] text-slate-300 italic">Carregando...</span>';
        const listAssert = document.getElementById('top-assert-list'); if(listAssert) listAssert.innerHTML = '<span class="text-[10px] text-slate-300 italic">Carregando...</span>';
    },

    carregarTela: async function() {
        const tbody = document.getElementById('tabela-corpo');
        if(!tbody) return;

        this.resetarKPIs();
        this.updateHeader();
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-12"><i class="fas fa-server fa-pulse text-emerald-500"></i> Sincronizando dados...</td></tr>`;

        const datas = Produtividade.getDatasFiltro(); 
        // Determina mês/ano de referência baseados na data de início para buscar as metas
        const dataRef = new Date(datas.inicio + 'T12:00:00'); // Compensar timezone simples
        const mesRef = dataRef.getMonth() + 1;
        const anoRef = dataRef.getFullYear();

        try {
            // 1. Busca Dados de Produção (Sem colunas inexistentes em usuarios)
            // REMOVIDO: meta_producao, meta_assertividade de usuario:usuarios(...) para evitar erro 400
            const reqProducao = Sistema.supabase
                .from('producao')
                .select(`
                    id, quantidade, data_referencia, fator, justificativa, 
                    fifo, gradual_total, gradual_parcial, perfil_fc, 
                    assertividade,
                    usuario:usuarios (id, nome, funcao, contrato)
                `)
                .gte('data_referencia', datas.inicio)
                .lte('data_referencia', datas.fim);

            // 2. Busca Metas do Mês separadamente
            const reqMetas = Sistema.supabase
                .from('metas')
                .select('usuario_id, meta_producao, meta_assertividade')
                .eq('mes', mesRef)
                .eq('ano', anoRef);

            const [resProd, resMetas] = await Promise.all([reqProducao, reqMetas]);

            if (resProd.error) throw resProd.error;
            // Se der erro em metas (ex: tabela vazia), assumimos array vazio, não quebra tudo
            const listaMetas = resMetas.data || [];

            console.log(`✅ [GupyMesa] Produção: ${resProd.data.length} | Metas: ${listaMetas.length}`);
            
            this.processarDadosLocais(resProd.data, listaMetas);

        } catch (error) { 
            console.error("[GupyMesa] Erro Fatal:", error); 
            tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-rose-500 font-bold">Erro: ${error.message}</td></tr>`; 
            this.setTxt('kpi-validacao-real', 'Erro');
        }
    },

    processarDadosLocais: function(rawData, listaMetas) {
        const agrupado = {};
        const diasUnicosGlobais = new Set();
        
        // Cria mapa de metas para acesso rápido: { usuario_id: { meta_prod, meta_assert } }
        const mapaMetas = {};
        listaMetas.forEach(m => {
            mapaMetas[m.usuario_id] = {
                prod: Number(m.meta_producao) || 0,
                assert: Number(m.meta_assertividade) || 98
            };
        });

        rawData.forEach(row => {
            if (!row.usuario) return;

            const uid = row.usuario.id;
            const dataRef = row.data_referencia;
            diasUnicosGlobais.add(dataRef);

            if (!agrupado[uid]) {
                // Pega meta do mapa ou padrão
                const metasUser = mapaMetas[uid] || { prod: 0, assert: 98 };

                agrupado[uid] = {
                    usuario: {
                        id: uid,
                        nome: row.usuario.nome,
                        funcao: row.usuario.funcao,
                        contrato: row.usuario.contrato
                    },
                    meta_real: metasUser.prod,
                    meta_assertividade: metasUser.assert,
                    totais: {
                        qty: 0,
                        diasUteis: 0,
                        justificativa: new Set(),
                        fifo: 0,
                        gt: 0,
                        gp: 0
                    },
                    auditoria: {
                        qtd: 0,
                        soma: 0
                    }
                };
            }

            const u = agrupado[uid];
            u.totais.qty += Number(row.quantidade) || 0;
            u.totais.fifo += Number(row.fifo) || 0;
            u.totais.gt += Number(row.gradual_total) || 0;
            u.totais.gp += Number(row.gradual_parcial) || 0;
            
            const fator = (row.fator !== undefined && row.fator !== null) ? Number(row.fator) : 1;
            u.totais.diasUteis += fator;

            if (row.justificativa) u.totais.justificativa.add(row.justificativa);

            if (row.assertividade) {
                let valStr = String(row.assertividade).replace('%', '').replace(',', '.').trim();
                let val = parseFloat(valStr);
                if (!isNaN(val) && val > 0) {
                    u.auditoria.soma += val;
                    u.auditoria.qtd += 1;
                }
            }
        });

        this.diasAtivosGlobal = diasUnicosGlobais.size;

        this.dadosOriginais = Object.values(agrupado).map(d => {
            d.totais.justificativa = Array.from(d.totais.justificativa).join('; ');
            return d;
        });

        const filtroNome = document.getElementById('selected-name')?.textContent;
        if (this.usuarioSelecionado && filtroNome) {
            this.filtrarUsuario(this.usuarioSelecionado, filtroNome);
        } else {
            this.renderizarTabela();
            this.atualizarKPIsGlobal(this.dadosOriginais);
        }
    },
    
    // --- FUNÇÕES AUXILIARES E DE RENDERIZAÇÃO (Mantidas) ---

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
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado para este período.</td></tr>'; 
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
                : '<span class="text-xs">-</span>';

            const temJustificativa = d.totais.justificativa && d.totais.justificativa.length > 0;
            const isAbonado = d.totais.diasUteis % 1 !== 0 || d.totais.diasUteis === 0;
            
            const styleAbono = (isAbonado || temJustificativa) 
                ? 'text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded cursor-help decoration-dotted underline decoration-amber-400' 
                : 'font-mono text-slate-500';

            return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 group text-xs text-slate-600">
                <td class="px-2 py-3 text-center bg-slate-50/30">
                    <input type="checkbox" class="check-user cursor-pointer" value="${d.usuario.id}">
                </td>
                <td class="px-2 py-3 text-center">
                    <button onclick="Produtividade.Geral.mudarFator('${d.usuario.id}', 0)" class="text-[10px] font-bold text-slate-400 hover:text-blue-500 border border-slate-200 rounded px-1 py-0.5 hover:bg-white transition" title="Abonar">AB</button>
                </td>
                <td class="px-3 py-3 font-bold text-slate-700 group-hover:text-blue-600 transition cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                    <div class="flex flex-col">
                        <span class="truncate" title="${d.usuario.nome}">${d.usuario.nome}</span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">${d.usuario.funcao || 'ND'}</span>
                    </div>
                </td>
                
                <td class="px-2 py-3 text-center" title="${temJustificativa ? d.totais.justificativa : ''}">
                    <span class="${styleAbono} px-1.5 py-0.5 inline-block">
                        ${Number(d.totais.diasUteis).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        ${temJustificativa ? '<span class="text-[8px] align-top text-amber-500">*</span>' : ''}
                    </span>
                </td>

                <td class="px-2 py-3 text-center text-slate-500">${d.totais.fifo}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gt}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gp}</td>
                <td class="px-2 py-3 text-center bg-slate-50/50 text-slate-400 font-mono">${metaDia}</td>
                <td class="px-2 py-3 text-center font-bold text-slate-600 bg-slate-50/50">${Math.round(metaDia * d.totais.diasUteis).toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center font-black text-blue-700 bg-blue-50/30 border-x border-blue-100 text-sm">
                    ${d.totais.qty.toLocaleString('pt-BR')}
                </td>
                <td class="px-2 py-3 text-center ${corProducao} ${corProducaoBg}">
                    ${atingimento.toFixed(1)}%
                </td>
                <td class="px-2 py-2 text-center border-l border-slate-100 align-middle">
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
        let totalProdGeral = 0;
        let totalMetaGeral = 0;
        let totalProdAssistentes = 0;
        let totalMetaAssistentes = 0;
        let manDaysAssistentes = 0;
        let ativosCountAssistentes = 0;
        let somaNotasAssistentes = 0;
        let qtdAuditoriasAssistentes = 0;

        if (!dados || dados.length === 0) {
            this.resetarKPIs();
            return;
        }

        dados.forEach(d => {
            const funcao = (d.usuario.funcao || '').toUpperCase();
            const isAssistente = !['AUDITORA', 'GESTORA'].includes(funcao);
            
            const diasUser = Number(d.totais.diasUteis);
            const prodUser = Number(d.totais.qty);
            const metaUser = Number(d.meta_real) * diasUser;

            totalProdGeral += prodUser;
            totalMetaGeral += metaUser;

            if (isAssistente || isFiltrado) {
                ativosCountAssistentes++;
                manDaysAssistentes += diasUser;
                totalProdAssistentes += prodUser;
                totalMetaAssistentes += metaUser;
                
                somaNotasAssistentes += Number(d.auditoria.soma || 0);
                qtdAuditoriasAssistentes += Number(d.auditoria.qtd || 0);
            }
        });

        this.setTxt('kpi-validacao-real', totalProdGeral.toLocaleString('pt-BR'));
        this.setTxt('kpi-validacao-esperado', totalMetaGeral.toLocaleString('pt-BR'));
        const barVol = document.getElementById('bar-volume');
        if(barVol) barVol.style.width = totalMetaGeral > 0 ? Math.min((totalProdGeral/totalMetaGeral)*100, 100) + '%' : '0%';

        const mediaGlobalAssert = qtdAuditoriasAssistentes > 0 ? (somaNotasAssistentes / qtdAuditoriasAssistentes) : 0;
        this.setTxt('kpi-meta-assertividade-val', mediaGlobalAssert.toFixed(2).replace('.', ',') + '%');
        
        this.setTxt('kpi-meta-producao-val', totalMetaGeral > 0 ? ((totalProdGeral/totalMetaGeral)*100).toFixed(1) + '%' : '0%');

        const capacidadeTotalPadrao = 17; 
        this.setTxt('kpi-capacidade-info', `${ativosCountAssistentes}/${capacidadeTotalPadrao}`);
        const capPct = (ativosCountAssistentes / capacidadeTotalPadrao) * 100;
        this.setTxt('kpi-capacidade-pct', Math.round(capPct) + '%');
        const barCap = document.getElementById('bar-capacidade');
        if(barCap) barCap.style.width = Math.min(capPct, 100) + '%';

        const divisor = manDaysAssistentes > 0 ? manDaysAssistentes : 1;
        const velReal = Math.round(totalProdAssistentes / divisor);
        const velMeta = Math.round(totalMetaAssistentes / divisor);
        this.setTxt('kpi-media-real', `${velReal}`);
        this.setTxt('kpi-media-esperada', `${velMeta}`);
        
        let diasDisplay = this.diasAtivosGlobal;
        if (isFiltrado && dados.length > 0) {
            diasDisplay = dados[0].totais.diasUteis.toLocaleString('pt-BR');
        } else if (this.diasAtivosGlobal === 0) {
            diasDisplay = '0';
        }
        this.setTxt('kpi-dias-uteis', diasDisplay); 

        this.renderTopLists(dados);
    },

    renderTopLists: function(dados) {
        const op = dados.filter(d => !['AUDITORA', 'GESTORA'].includes((d.usuario.funcao || '').toUpperCase()));
        
        const topProd = [...op].sort((a,b) => b.totais.qty - a.totais.qty).slice(0, 3);
        const listProd = document.getElementById('top-prod-list');
        if(listProd) listProd.innerHTML = topProd.map(u => `<div class="flex justify-between text-[10px]"><span class="truncate w-16" title="${u.usuario.nome}">${u.usuario.nome.split(' ')[0]}</span><span class="font-bold text-slate-600">${Number(u.totais.qty).toLocaleString('pt-BR')}</span></div>`).join('');

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

    abonarEmMassa: async function() {
        const checks = document.querySelectorAll('.check-user:checked');
        if (checks.length === 0) return alert("Selecione pelo menos um assistente na lista.");

        let dataAlvo = document.getElementById('sel-data-dia')?.value; 
        if (!dataAlvo) {
            dataAlvo = prompt("Aplicar Abono em Massa.\nDigite a data (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
            if (!dataAlvo) return;
        }

        const opcao = prompt(`ABONO EM MASSA PARA ${checks.length} USUÁRIOS (${dataAlvo})\n\nEscolha o fator:\n1 - Dia Normal (1.0)\n2 - Meio Período (0.5)\n0 - Abonar Totalmente (0.0)\n\nDigite o código:`, "0");
        if (opcao === null) return;

        let novoFator = 1.0;
        if (opcao === '2' || opcao === '0.5') novoFator = 0.5;
        if (opcao === '0') novoFator = 0.0;

        let justificativa = "";
        if (novoFator !== 1.0) {
            justificativa = prompt("JUSTIFICATIVA OBRIGATÓRIA:");
            if (!justificativa) return alert("❌ Cancelado: Justificativa obrigatória.");
        }

        if (!confirm(`Confirmar ação para ${checks.length} usuários?\nData: ${dataAlvo}\nFator: ${novoFator}\nMotivo: ${justificativa || 'Nenhum'}`)) return;

        let sucessos = 0;
        for (const chk of checks) {
            try {
                await Sistema.supabase.rpc('abonar_producao', {
                    p_usuario_id: chk.value,
                    p_data: dataAlvo,
                    p_fator: novoFator,
                    p_justificativa: justificativa
                });
                sucessos++;
            } catch (err) { console.error(err); }
        }
        alert(`✅ Processo finalizado! ${sucessos}/${checks.length} atualizados.`);
        this.carregarTela();
    },

    mudarFator: async function(uid, fatorAtual) {
        let dataAlvo = document.getElementById('sel-data-dia')?.value; 
        if (!dataAlvo) {
            dataAlvo = prompt("Data (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
            if (!dataAlvo) return;
        }
        const opcao = prompt(`ABONAR DIA (${dataAlvo})\n1 - Normal\n2 - Meio\n0 - Abono\nCódigo:`, "0");
        if (opcao === null) return;

        let novoFator = 1.0;
        if (opcao === '2' || opcao === '0.5') novoFator = 0.5;
        if (opcao === '0') novoFator = 0.0;

        let justificativa = "";
        if (novoFator !== 1.0) {
            justificativa = prompt("Justificativa:");
            if (!justificativa) return alert("Justificativa obrigatória.");
        }

        try {
            const { error } = await Sistema.supabase.rpc('abonar_producao', {
                p_usuario_id: uid, p_data: dataAlvo, p_fator: novoFator, p_justificativa: justificativa
            });
            if (error) throw error;
            alert(`✅ Sucesso!`);
            this.carregarTela();
        } catch (error) { alert("Erro: " + error.message); }
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