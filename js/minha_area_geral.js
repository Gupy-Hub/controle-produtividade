const MA_Diario = {
    normalizarDadosPorNome: function(rawData) {
        const agrupado = {};
        rawData.forEach(item => {
            if (MA_Main.userRoles[item.usuario_id] !== 'Assistente') return;
            const nome = MA_Main.usersMap[item.usuario_id] || 'Desconhecido';
            const data = item.data_referencia;
            if (!agrupado[data]) agrupado[data] = {};
            if (!agrupado[data][nome]) {
                agrupado[data][nome] = {
                    id_ref: item.id, 
                    nome: nome,
                    quantidade: 0, 
                    meta_diaria: item.meta_diaria || 650,
                    observacao: item.observacao || '', 
                    observacao_gestora: item.observacao_gestora || ''
                };
            }
            agrupado[data][nome].quantidade += item.quantidade;
            if (item.observacao && !agrupado[data][nome].observacao.includes(item.observacao)) agrupado[data][nome].observacao += ` | ${item.observacao}`;
        });
        return agrupado;
    },

    atualizarKPIs: function(dados) {
        const total = dados.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator !== undefined ? curr.fator : 1), 0);
        const metaTotal = dados.reduce((acc, curr) => acc + (curr.meta_ajustada !== undefined ? curr.meta_ajustada : 650), 0);

        const media = diasEfetivos > 0 ? Math.round(total / diasEfetivos) : 0;
        const atingimento = metaTotal > 0 ? Math.round((total / metaTotal) * 100) : 0;

        this.setTxt('kpi-total', total.toLocaleString());
        this.setTxt('kpi-meta-total', metaTotal.toLocaleString());
        this.setTxt('kpi-porcentagem', atingimento + '%');
        this.setTxt('kpi-media-real', media.toLocaleString());
        
        const bar = document.getElementById('bar-progress');
        const icon = document.getElementById('icon-status');
        
        if(bar) bar.style.width = Math.min(atingimento, 100) + '%';
        
        if(icon && bar) {
            if(atingimento>=100) { 
                bar.className="bg-emerald-500 h-full rounded-full"; 
                icon.className="fas fa-check-circle text-emerald-500 text-lg"; 
            } else if(atingimento>=80) { 
                bar.className="bg-amber-400 h-full rounded-full"; 
                icon.className="fas fa-exclamation-circle text-amber-500 text-lg"; 
            } else { 
                bar.className="bg-rose-500 h-full rounded-full"; 
                icon.className="fas fa-times-circle text-rose-500 text-lg"; 
            }
        }
    },

    atualizarTabelaDiaria: function(dados, viewingTime) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registo encontrado neste período.</td></tr>'; return; }
        
        let html = '';
        dados.sort((a,b) => new Date(b.data_referencia) - new Date(a.data_referencia));

        dados.forEach(item => {
            const metaReal = item.meta_ajustada !== undefined ? item.meta_ajustada : 650;
            const fator = item.fator !== undefined ? item.fator : 1;
            
            let pct = 0;
            let statusHtml = '';
            
            if (fator === 0) {
                statusHtml = '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-slate-200">Abonado</span>';
            } else {
                pct = metaReal > 0 ? Math.round((item.quantidade / metaReal) * 100) : 0;
                let colorClass = '';
                if(pct >= 100) colorClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                else if(pct >= 80) colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
                else colorClass = 'bg-rose-100 text-rose-700 border-rose-200';
                
                statusHtml = `<span class="${colorClass} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border">${pct}%</span>`;
            }

            const dFmt = item.data_referencia.split('-').reverse().join('/');
            
            let displayMeta = metaReal;
            let infoFator = '';
            if (fator < 1 && fator > 0) {
                infoFator = `<span class="ml-1 text-[9px] text-amber-600 bg-amber-50 px-1 rounded" title="Fator/Média aplicada">Fat ${fator.toFixed(2)}</span>`;
            }

            let inputMeta = `<div class="flex flex-col items-center"><span class="font-bold text-slate-600">${displayMeta}</span>${infoFator}</div>`;
            
            if(MA_Main.isMgr && !viewingTime && item.id) {
                inputMeta = `<div class="flex flex-col items-center gap-1">
                                <input type="number" value="${item.meta_diaria}" onchange="MA_Diario.atualizarMeta(${item.id}, this.value, ${item.meta_diaria})" class="w-16 text-center border border-slate-200 rounded px-1 py-0.5 text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200">
                                ${infoFator}
                             </div>`;
            }
            
            let obs = item.observacao || '<span class="text-slate-300">-</span>';
            if (obs.includes('Abonos:')) {
                const parts = obs.split('Abonos:');
                obs = `${parts[0]}<br><span class="text-[10px] text-amber-600 font-bold bg-amber-50 px-1 rounded mt-1 inline-block border border-amber-100">Abonos:${parts[1]}</span>`;
            }

            if(item.observacao_gestora) obs += `<div class="mt-1 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded border border-blue-100"><i class="fas fa-user-shield mr-1"></i>${item.observacao_gestora}</div>`;
            
            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                        <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                        <td class="px-6 py-4 text-center font-black text-blue-600 text-lg">${item.quantidade}</td>
                        <td class="px-6 py-4 text-center">${inputMeta}</td>
                        <td class="px-6 py-4 text-center">${statusHtml}</td>
                        <td class="px-6 py-4 text-xs text-slate-500 max-w-xs break-words">${obs}</td>
                    </tr>`;
        });
        tbody.innerHTML = html;
    },

    atualizarMeta: async function(id, nv, av) { 
        if(nv==av) return; 
        const m = prompt("Motivo da alteração de meta:"); 
        if(!m){ MA_Main.atualizarDashboard(); return;} 
        const obs = `${new Date().toLocaleDateString()} - Alterado ${av}->${nv}: ${m}`; 
        await _supabase.from('producao').update({meta_diaria:nv, observacao_gestora:obs}).eq('id',id); 
        MA_Main.atualizarDashboard(); 
    },

    // --- FUNCIONALIDADE: PRESENÇA (ONTEM) --- //

    verificarAcessoHoje: async function() {
        // Só exibe para assistentes
        if(MA_Main.isMgr) return;
        
        const box = document.getElementById('box-confirmacao-leitura');
        
        // CALCULA A DATA DE ONTEM
        const data = new Date();
        data.setDate(data.getDate() - 1); 
        const dataRef = data.toISOString().split('T')[0];
        
        // Verifica se ONTEM foi fim de semana (Sábado=6, Domingo=0)
        const diaSemana = data.getDay();
        if(diaSemana === 0 || diaSemana === 6) {
            // Se ontem foi fim de semana, não exige confirmação
            if(box) box.classList.add('hidden');
            return;
        }

        const { data: reg } = await _supabase
            .from('acessos_diarios')
            .select('id')
            .eq('usuario_id', MA_Main.sessao.id)
            .eq('data_referencia', dataRef); // Busca pela data de ontem
            
        // Se já confirmou, esconde. Se não, mostra.
        if (reg && reg.length > 0) {
            if(box) box.classList.add('hidden');
        } else {
            if(box) {
                box.classList.remove('hidden');
                // Atualiza o texto para deixar claro que é sobre ontem
                const txt = document.querySelector('#box-confirmacao-leitura p');
                if(txt) txt.innerText = "Confirme que verificou suas metas do dia anterior.";
            }
        }
    },

    confirmarAcessoHoje: async function() {
        // CALCULA A DATA DE ONTEM PARA SALVAR
        const data = new Date();
        data.setDate(data.getDate() - 1);
        const dataRef = data.toISOString().split('T')[0];
        
        const btn = document.querySelector('#box-confirmacao-leitura button');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        
        const { error } = await _supabase.from('acessos_diarios').insert({
            usuario_id: MA_Main.sessao.id,
            data_referencia: dataRef // Salva como ontem
        });
        
        if(error) {
            alert("Erro ao confirmar: " + error.message);
            if(btn) btn.innerHTML = 'Tentar Novamente';
        } else {
            document.getElementById('box-confirmacao-leitura').classList.add('hidden');
            alert("Presença do dia anterior confirmada!");
        }
    },

    carregarRelatorioAcessos: async function() {
        // Só exibe para Gestoras/Auditoras
        if(!MA_Main.isMgr) return;

        const box = document.getElementById('box-relatorio-acessos');
        const lista = document.getElementById('lista-presenca-time');
        const lblData = document.getElementById('lbl-data-acesso');
        
        if(!box || !lista) return;

        box.classList.remove('hidden');
        
        // Data selecionada no filtro (ou Hoje se estiver vazio)
        const dt = MA_Main.getDateFromInput();
        const dataStr = dt.toISOString().split('T')[0];
        const dataFmt = dataStr.split('-').reverse().join('/');
        
        lblData.innerText = dataFmt;
        lista.innerHTML = '<span class="col-span-full text-center text-slate-400 py-4"><i class="fas fa-spinner fa-spin"></i> Carregando presenças...</span>';

        // 1. Busca todos os usuários ativos que são Assistentes
        const { data: users } = await _supabase
            .from('usuarios')
            .select('id, nome')
            .eq('funcao', 'Assistente')
            .eq('ativo', true)
            .order('nome');

        // 2. Busca os acessos da data selecionada
        const { data: acessos } = await _supabase
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
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    }
};