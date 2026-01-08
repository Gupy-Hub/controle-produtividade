MinhaArea.Geral = {
    // Objeto auxiliar para simular o comportamento do MA_Diario original
    MA_Main_Mock: {
        get isMgr() {
            if (!MinhaArea.user || !MinhaArea.user.cargo) return false;
            const c = MinhaArea.user.cargo.toUpperCase();
            return c === 'GESTORA' || c === 'AUDITORA';
        },
        atualizarDashboard: function() {
            MinhaArea.Geral.carregar();
        }
    },

    carregar: async function() {
        // Garante que o usuário está carregado
        if (!MinhaArea.user) return;

        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;
        const tbody = document.getElementById('tabela-diario');

        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        // Verifica check-in de presença (Lógica do dia anterior)
        this.verificarAcessoHoje();
        // Se for gestor, carrega relatório
        this.carregarRelatorioAcessos();

        try {
            // 1. Busca Produção do Mês (select * para pegar observacao, observacao_gestora, fator, etc)
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. Busca Metas Vigentes (para fallback caso não tenha no registro)
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // Processamento dos dados
            const dadosProcessados = producao.map(item => {
                // Tenta pegar a meta salva no registro (snapshot), senão busca na tabela de metas
                let metaBase = 650; // Valor padrão
                
                // Prioridade 1: Meta gravada no registro de produção
                if (item.meta_diaria !== null && item.meta_diaria !== undefined) {
                    metaBase = Number(item.meta_diaria);
                } 
                // Prioridade 2: Meta vigente na data
                else if (metas && metas.length > 0) {
                    const metaVigente = metas.find(m => m.data_inicio <= item.data_referencia);
                    if (metaVigente) metaBase = Number(metaVigente.valor_meta);
                }

                // Normaliza o fator (trata null como 1)
                // Verifica 'fator' (nome provável no DB) e 'fator_multiplicador' (nome alternativo)
                let fator = 1;
                if (item.fator !== undefined && item.fator !== null) fator = Number(item.fator);
                else if (item.fator_multiplicador !== undefined && item.fator_multiplicador !== null) fator = Number(item.fator_multiplicador);

                // Meta Ajustada (Calculada) = Meta Base * Fator
                // Se o fator for 0 (abono), a meta ajustada tecnicamente seria 0 para cálculo de atingimento
                const metaAjustada = Math.round(metaBase * (fator === 0 ? 0 : fator)); 

                return {
                    id: item.id,
                    data_referencia: item.data_referencia,
                    quantidade: Number(item.quantidade) || 0,
                    meta_original: metaBase,    // Valor cheio (ex: 650)
                    meta_ajustada: metaAjustada, // Valor com fator (ex: 325 ou 0)
                    fator: fator,
                    observacao: item.observacao,
                    observacao_gestora: item.observacao_gestora
                };
            });

            this.atualizarKPIs(dadosProcessados);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error("Erro ao carregar Minha Área:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro ao carregar dados: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados) {
        // Soma produção total
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        
        // Soma meta total (considerando apenas dias com fator > 0 para a meta esperada do mês, ou soma tudo)
        // Lógica: Meta Acumulada = Soma das metas ajustadas de cada dia registrado
        const totalMeta = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? curr.meta_original * curr.fator : 0), 0);
        
        // Dias efetivos: Dias onde o fator foi > 0 (trabalhados)
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);

        // Média: Produção / Dias Efetivos
        const media = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        
        // Atingimento: Produção / Meta Total
        const atingimento = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;

        // Atualiza Interface
        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(totalMeta).toLocaleString('pt-BR'));
        this.setTxt('kpi-porcentagem', `${atingimento}%`);
        this.setTxt('kpi-media-real', media.toLocaleString('pt-BR'));
        
        // Barra de Progresso
        const bar = document.getElementById('bar-progress');
        const icon = document.getElementById('icon-status');
        
        if(bar) {
            bar.style.width = `${Math.min(atingimento, 100)}%`;
            if(atingimento >= 100) bar.className = "h-full bg-emerald-500 rounded-full transition-all duration-500";
            else if(atingimento >= 80) bar.className = "h-full bg-blue-500 rounded-full transition-all duration-500";
            else bar.className = "h-full bg-rose-500 rounded-full transition-all duration-500";
        }

        // Ícone de Status
        if(icon) {
            icon.className = ""; // Limpa classes
            if(atingimento >= 100) {
                icon.className = "fas fa-trophy text-yellow-300 text-3xl animate-bounce";
            } else if(atingimento >= 90) {
                icon.className = "fas fa-thumbs-up text-emerald-400 text-3xl";
            } else if(atingimento >= 80) {
                icon.className = "fas fa-check text-blue-300 text-3xl";
            } else {
                icon.className = "fas fa-exclamation-triangle text-rose-300 text-3xl";
            }
        }
    },

    atualizarTabelaDiaria: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registro encontrado neste mês.</td></tr>'; 
            return; 
        }
        
        let html = '';
        // Ordena por data decrescente (mais recente primeiro)
        dados.sort((a,b) => new Date(b.data_referencia) - new Date(a.data_referencia));

        dados.forEach(item => {
            const fator = item.fator;
            const metaDisplay = item.meta_original; // Mostra a meta base (ex: 650) e avisa se tiver fator
            
            let pct = 0;
            let statusHtml = '';
            
            if (fator === 0) {
                statusHtml = '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-slate-200">Abonado</span>';
            } else {
                // Cálculo de atingimento do dia
                // Se fator for 0.5, meta ajustada é 325. Se prod for 325, atingimento é 100%.
                const metaDoDia = item.meta_ajustada;
                pct = metaDoDia > 0 ? Math.round((item.quantidade / metaDoDia) * 100) : 0;
                
                let colorClass = '';
                if(pct >= 100) colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                else if(pct >= 80) colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
                else colorClass = 'bg-rose-100 text-rose-700 border-rose-200';
                
                statusHtml = `<span class="${colorClass} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border">${pct}%</span>`;
            }

            const dFmt = item.data_referencia.split('-').reverse().join('/');
            
            // Tratamento visual do Fator
            let infoFator = '';
            if (fator < 1 && fator > 0) {
                infoFator = `<span class="ml-1 text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 font-bold" title="Jornada Reduzida">x${fator}</span>`;
            }

            // Coluna Meta (com input se for gestor)
            let inputMeta = `<div class="flex flex-col items-center"><span class="font-bold text-slate-600">${Math.round(metaDisplay)}</span>${infoFator}</div>`;
            
            if(this.MA_Main_Mock.isMgr && item.id) {
                inputMeta = `<div class="flex flex-col items-center gap-1">
                                <input type="number" 
                                       value="${item.meta_original}" 
                                       onchange="MinhaArea.Geral.atualizarMeta(${item.id}, this.value, ${item.meta_original})" 
                                       class="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200 transition">
                                ${infoFator}
                             </div>`;
            }
            
            // Tratamento de Observações
            let obs = item.observacao || '';
            // Formata se tiver prefixo "Abonos:"
            if (obs.includes('Abonos:')) {
                const parts = obs.split('Abonos:');
                obs = `${parts[0]}<div class="mt-1"><span class="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100"><i class="fas fa-umbrella-beach mr-1"></i>Abono: ${parts[1]}</span></div>`;
            } else if (!obs && !item.observacao_gestora) {
                obs = '<span class="text-slate-300">-</span>';
            }

            // Adiciona Observação da Gestora se houver
            if(item.observacao_gestora) {
                obs += `<div class="mt-1.5 text-[10px] text-blue-700 bg-blue-50 p-1.5 rounded border border-blue-100 flex items-start gap-1">
                            <i class="fas fa-user-shield mt-0.5"></i>
                            <span>${item.observacao_gestora}</span>
                        </div>`;
            }
            
            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition group">
                        <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                        <td class="px-6 py-4 text-center font-black text-blue-600 text-lg group-hover:scale-110 transition-transform">${item.quantidade}</td>
                        <td class="px-6 py-4 text-center">${inputMeta}</td>
                        <td class="px-6 py-4 text-center">${statusHtml}</td>
                        <td class="px-6 py-4 text-xs text-slate-500 max-w-sm break-words leading-relaxed">${obs}</td>
                    </tr>`;
        });
        tbody.innerHTML = html;
    },

    atualizarMeta: async function(id, novaMeta, metaAntiga) { 
        if(novaMeta == metaAntiga) return; 
        
        const motivo = prompt("Motivo da alteração de meta:"); 
        if(!motivo){ 
            this.carregar(); // Recarrega para desfazer a alteração visual
            return;
        } 
        
        const obs = `Alterado ${metaAntiga}->${novaMeta}: ${motivo}`; 
        
        try {
            const { error } = await MinhaArea.supabase
                .from('producao')
                .update({
                    meta_diaria: novaMeta, 
                    observacao_gestora: obs
                })
                .eq('id', id);

            if(error) throw error;
            
            alert("Meta atualizada com sucesso!");
            this.carregar();
            
        } catch(err) {
            console.error(err);
            alert("Erro ao atualizar: " + err.message);
        }
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },

    // --- FUNCIONALIDADE: PRESENÇA (ONTEM) --- //

    verificarAcessoHoje: async function() {
        if(this.MA_Main_Mock.isMgr) return;
        
        const box = document.getElementById('box-confirmacao-leitura');
        
        // CALCULA A DATA DE ONTEM
        const data = new Date();
        data.setDate(data.getDate() - 1); 
        const dataRef = data.toISOString().split('T')[0];
        
        // Se ontem foi fim de semana, ignora
        const diaSemana = data.getDay();
        if(diaSemana === 0 || diaSemana === 6) {
            if(box) box.classList.add('hidden');
            return;
        }

        const { data: reg } = await MinhaArea.supabase
            .from('acessos_diarios')
            .select('id')
            .eq('usuario_id', MinhaArea.user.id)
            .eq('data_referencia', dataRef);
            
        if (reg && reg.length > 0) {
            if(box) box.classList.add('hidden');
        } else {
            if(box) box.classList.remove('hidden');
        }
    },

    confirmarAcessoHoje: async function() {
        const data = new Date();
        data.setDate(data.getDate() - 1);
        const dataRef = data.toISOString().split('T')[0];
        
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({
            usuario_id: MinhaArea.user.id,
            data_referencia: dataRef 
        });
        
        if(error) {
            alert("Erro: " + error.message);
            if(btn) btn.innerText = 'Tentar Novamente';
        } else {
            document.getElementById('box-confirmacao-leitura').classList.add('hidden');
        }
    },

    carregarRelatorioAcessos: async function() {
        if(!this.MA_Main_Mock.isMgr) return;

        const box = document.getElementById('box-relatorio-acessos');
        const lista = document.getElementById('lista-presenca-time');
        const lblData = document.getElementById('lbl-data-acesso');
        
        if(!box || !lista) return;

        box.classList.remove('hidden');
        
        const dt = new Date();
        const dataStr = dt.toISOString().split('T')[0];
        const dataFmt = dataStr.split('-').reverse().join('/');
        
        lblData.innerText = dataFmt;
        lista.innerHTML = '<span class="col-span-full text-center text-slate-400 py-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</span>';

        const { data: users } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('perfil', 'assistente')
            .eq('ativo', true)
            .order('nome');

        const { data: acessos } = await MinhaArea.supabase
            .from('acessos_diarios')
            .select('usuario_id, created_at')
            .eq('data_referencia', dataStr);
            
        const acessosMap = {};
        if(acessos) {
            acessos.forEach(a => acessosMap[a.usuario_id] = a.created_at);
        }

        let html = '';
        if(users) {
            users.forEach(u => {
                const confirmou = acessosMap[u.id];
                let statusIcon = '<i class="fas fa-times-circle text-rose-300"></i>';
                let statusClass = 'border-rose-100 bg-rose-50 opacity-70';
                let hora = '';

                if(confirmou) {
                    statusIcon = '<i class="fas fa-check-circle text-emerald-500"></i>';
                    statusClass = 'border-emerald-100 bg-emerald-50';
                    const h = new Date(confirmou);
                    hora = `<span class="text-[9px] font-bold text-emerald-600 block mt-0.5">${h.getHours()}:${String(h.getMinutes()).padStart(2,'0')}</span>`;
                }

                html += `<div class="flex items-center gap-2 p-2 rounded-lg border ${statusClass}">
                            <div class="text-lg">${statusIcon}</div>
                            <div class="leading-tight">
                                <span class="text-xs font-bold text-slate-700 block">${u.nome.split(' ')[0]}</span>
                                ${hora}
                            </div>
                         </div>`;
            });
        }
        lista.innerHTML = html;
    }
};