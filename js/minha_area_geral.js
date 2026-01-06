// js/minha_area_geral.js

const MA_Checkin = {
    
    // Auxiliar: Busca o último dia trabalhado (para visão da Assistente)
    obterUltimoDiaTrabalhado: async function() {
        const hoje = new Date().toISOString().split('T')[0];
        const { data, error } = await _supabase
            .from('producao')
            .select('data_referencia')
            .eq('usuario_id', MA_Main.sessao.id)
            .lt('data_referencia', hoje)
            .order('data_referencia', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return null;
        return data.data_referencia;
    },

    verificar: async function(dataVisualizadaNoPainel) {
        const container = document.getElementById('container-checkin');
        if (!container) return;
        
        // Limpa antes de renderizar para evitar duplicidade
        container.innerHTML = '';

        if (MA_Main.isMgr) {
            // --- VISÃO GESTORA (Check-in do Time) ---
            const dataRef = dataVisualizadaNoPainel;
            
            // 1. Busca quem TRABALHOU (teve produção) neste dia
            const { data: producoes } = await _supabase
                .from('producao')
                .select('usuario_id')
                .eq('data_referencia', dataRef);
            
            // Se ninguém produziu nada no dia, não há quem cobrar check-in
            if (!producoes || producoes.length === 0) {
                const btn = document.createElement('button');
                btn.className = `flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold bg-slate-50 text-slate-400 border-slate-200 cursor-default`;
                btn.innerHTML = `<i class="fas fa-ban"></i> Sem produção neste dia`;
                container.appendChild(btn);
                return;
            }

            // Extrai IDs únicos de quem produziu
            const idsQueProduziram = [...new Set(producoes.map(p => p.usuario_id))];

            // 2. Busca os detalhes desses usuários (apenas Assistentes)
            const { data: users } = await _supabase
                .from('usuarios')
                .select('id, nome')
                .in('id', idsQueProduziram)
                .eq('funcao', 'Assistente');

            // 3. Busca quem já fez o check-in nesse dia
            const { data: checkins } = await _supabase
                .from('checkins')
                .select('usuario_id')
                .eq('data_referencia', dataRef);
            
            if (users) {
                const total = users.length; // Total esperado = quem produziu
                
                // Filtra checkins válidos (apenas de quem produziu, caso haja lixo no banco)
                const checkinsValidos = checkins ? checkins.filter(c => idsQueProduziram.includes(c.usuario_id)) : [];
                const feitos = checkinsValidos.length;
                
                const checkedIds = checkinsValidos.map(c => c.usuario_id);
                const pendentes = users.filter(u => !checkedIds.includes(u.id));

                const colorClass = feitos === total ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
                
                // Botão da Gestora
                const btn = document.createElement('button');
                btn.className = `flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition shadow-sm ${colorClass}`;
                
                const dataFmt = dataRef.split('-').reverse().slice(0,2).join('/');
                btn.innerHTML = `<i class="fas fa-tasks"></i> Check-in (${dataFmt}): ${feitos}/${total}`;
                
                // Só abre modal se houver pendências ou para ver a lista completa
                btn.onclick = () => this.abrirModalPendencias(pendentes, total === 0);
                
                container.appendChild(btn);
            }

        } else {
            // --- VISÃO ASSISTENTE (Dia Útil Anterior) ---
            const dataAlvo = await this.obterUltimoDiaTrabalhado();

            if (!dataAlvo) return; // Nunca trabalhou antes

            const dataAlvoFmt = dataAlvo.split('-').reverse().join('/');

            const { data: checkData } = await _supabase.from('checkins')
                .select('*')
                .eq('usuario_id', MA_Main.sessao.id)
                .eq('data_referencia', dataAlvo)
                .single();

            const jaFez = !!checkData;
            const btn = document.createElement('button');
            
            if (jaFez) {
                btn.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold cursor-default shadow-sm opacity-80";
                btn.innerHTML = `<i class="fas fa-check-double"></i> Dia ${dataAlvoFmt.slice(0,5)} Validado`;
            } else {
                btn.className = "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition shadow-sm animate-pulse";
                btn.innerHTML = `<i class="fas fa-exclamation-circle"></i> Validar ${dataAlvoFmt}`;
                btn.title = "Clique para confirmar sua produção do último dia trabalhado";
                btn.onclick = () => this.realizarCheckin(dataAlvo, dataAlvoFmt);
            }
            container.appendChild(btn);
        }
    },

    realizarCheckin: async function(dataRef, dataFmt) {
        const { data: prod } = await _supabase.from('producao')
            .select('quantidade')
            .eq('usuario_id', MA_Main.sessao.id)
            .eq('data_referencia', dataRef)
            .single();
            
        const qtd = prod ? prod.quantidade : 0;

        if (!confirm(`CONFIRMAÇÃO DE DADOS\n\nData: ${dataFmt}\nSua Produção: ${qtd} documentos\n\nVocê confirma que estes dados estão corretos?`)) return;

        const { error } = await _supabase.from('checkins').insert({
            usuario_id: MA_Main.sessao.id,
            data_referencia: dataRef
        });

        if (error) {
            if(error.code === '23505') {
                alert("Check-in já realizado para esta data!");
                this.verificar(null);
            } else {
                alert('Erro ao realizar check-in: ' + error.message);
            }
        } else {
            alert("Dados validados com sucesso!");
            // Força atualização visual sem precisar recarregar página inteira
            // Passamos null ou dataRef dependendo do contexto, mas aqui a assistente olha pro banco
            this.verificar(null); 
        }
    },

    abrirModalPendencias: function(listaPendentes, vazio) {
        const modal = document.getElementById('modal-pendencias');
        const listaBody = document.getElementById('lista-pendentes-body');
        
        if (vazio) {
             listaBody.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold">Ninguém produziu nesta data.</div>';
        } else if (listaPendentes.length === 0) {
            listaBody.innerHTML = '<div class="text-center py-8 text-emerald-500 font-bold"><i class="fas fa-check-circle text-4xl mb-2 block"></i>Todos validaram!</div>';
        } else {
            let html = '<ul class="space-y-2">';
            listaPendentes.forEach(u => {
                html += `<li class="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-100">
                    <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 font-bold text-xs border border-slate-200">${u.nome.charAt(0)}</div>
                    <span class="text-sm font-bold text-slate-700">${u.nome}</span>
                </li>`;
            });
            html += '</ul>';
            listaBody.innerHTML = html;
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

const MA_Diario = {
    normalizarDados: function(rawData) {
        const agrupado = {};
        rawData.forEach(item => {
            const role = MA_Main.userRoles[item.usuario_id];
            if (role !== 'Assistente') return;
            const nome = MA_Main.usersMap[item.usuario_id] || 'Desconhecido';
            const data = item.data_referencia;
            if (!agrupado[data]) agrupado[data] = {};
            if (!agrupado[data][nome]) {
                agrupado[data][nome] = { nome: nome, id_ref: item.id, quantidade: 0, meta_diaria: 650 };
            }
            agrupado[data][nome].quantidade += item.quantidade;
        });
        return agrupado;
    },

    atualizarKPIs: function(dadosFinais, viewingTime, rawData) {
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };

        let total = 0;
        let metaTotal = 0;
        
        if (viewingTime && rawData) {
            const assistentesData = rawData.filter(r => MA_Main.userRoles[r.usuario_id] === 'Assistente');
            total = assistentesData.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
            
            assistentesData.forEach(r => {
                const nome = MA_Main.usersMap[r.usuario_id];
                const fator = Sistema.Dados.obterFator(nome, r.data_referencia);
                metaTotal += Math.round(650 * fator);
            });
        } else {
            total = dadosFinais.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
            if(dadosFinais.length > 0) dadosFinais.forEach(d => metaTotal += d.meta_ajustada); 
            else metaTotal = 650 * 22; 
        }

        const diasProdutivos = dadosFinais.filter(d => d.quantidade > 0).length;
        
        let media = 0;
        if (viewingTime) {
            const somaMediasDiarias = dadosFinais.reduce((acc, curr) => acc + curr.quantidade, 0);
            media = dadosFinais.length > 0 ? Math.round(somaMediasDiarias / dadosFinais.length) : 0;
        } else {
            media = diasProdutivos > 0 ? Math.round(total / diasProdutivos) : 0;
        }

        const atingimento = metaTotal > 0 ? Math.round((total / metaTotal) * 100) : 0;

        const valData = document.getElementById('global-date').value;
        const [y, m, d] = valData.split('-').map(Number);
        let diasUteisTotal = 0;
        const lastDay = new Date(y, m, 0).getDate();
        for(let i=1; i<=lastDay; i++) { const dt = new Date(y, m-1, i); if(dt.getDay()!==0 && dt.getDay()!==6) diasUteisTotal++; }

        setTxt('diario-card-dias-trab', diasProdutivos);
        setTxt('diario-card-dias-uteis', diasUteisTotal);
        setTxt('diario-card-total', total.toLocaleString());
        setTxt('diario-card-meta-total', metaTotal.toLocaleString());
        setTxt('diario-card-media', media.toLocaleString());
        setTxt('diario-kpi-pct', atingimento + '%');

        const cardPct = document.getElementById('diario-card-pct');
        const iconPct = document.getElementById('diario-icon-pct');
        if (cardPct) {
            cardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
            if (atingimento < 100) {
                cardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-times-circle text-xl text-white/50"></i>';
            } else {
                cardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-check-circle text-xl text-white/50"></i>';
            }
        }
    },

    atualizarTabela: function(dados, viewingTime, rawData) {
        const tbody = document.getElementById('tabela-diario');
        if (!dados.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registo encontrado.</td></tr>'; return; }
        
        let html = ''; 
        dados.sort((a,b) => b.data_referencia.localeCompare(a.data_referencia));

        dados.forEach(item => {
            const meta = item.meta_ajustada;
            const pct = meta > 0 ? Math.round((item.quantidade / meta) * 100) : (item.quantidade > 0 ? 100 : 0);
            
            let badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
            if (pct >= 100) badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
            else if (pct >= 80) badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
            
            const badge = (meta === 0 && item.fator === 0)
                ? '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-bold border border-slate-200">Abonado</span>'
                : `<span class="${badgeClass} px-2 py-1 rounded text-xs font-bold border">${pct}%</span>`;

            let obsHtml = '';
            
            if (rawData && !viewingTime) {
                const doDia = rawData.filter(r => r.data_referencia === item.data_referencia && MA_Main.userRoles[r.usuario_id] === 'Assistente');
                const totalDia = doDia.reduce((acc, r) => acc + r.quantidade, 0);
                const countDia = doDia.length;
                const mediaDia = countDia > 0 ? Math.round(totalDia / countDia) : 0;
                
                obsHtml += `<div class="flex items-center gap-1 text-[10px] text-slate-500 font-medium mb-1">
                    <i class="fas fa-users text-slate-400"></i> Média Time: <strong class="text-slate-700">${mediaDia}</strong>
                </div>`;
            }

            const fator = item.fator !== undefined ? item.fator : 1;
            if (fator < 1) {
                const motivo = Sistema.Dados.obterMotivo(item.nome, item.data_referencia) || "Sem motivo registrado";
                const tipoAbono = fator === 0 ? "Abono Total" : "Meio Período";
                obsHtml += `<div class="mt-1 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded border border-blue-100">
                    <i class="fas fa-info-circle mr-1"></i> <strong>${tipoAbono}:</strong> ${motivo}
                </div>`;
            } else if (viewingTime) {
                obsHtml = `<span class="text-xs text-slate-400">Média calculada sobre o time ativo.</span>`;
            }

            const dFmt = item.data_referencia.split('-').reverse().join('/');
            const displayMeta = meta === 0 ? '<span class="text-slate-300">-</span>' : meta;

            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                <td class="px-6 py-4 text-center font-black text-blue-600 text-lg">${item.quantidade.toLocaleString()}</td>
                <td class="px-6 py-4 text-center font-bold text-slate-500">${displayMeta}</td>
                <td class="px-6 py-4 text-center">${badge}</td>
                <td class="px-6 py-4 text-xs">${obsHtml}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },
    
    atualizarMetaBD: async function() { alert("Ação não permitida."); } 
};

// ... Mantenha o resto (MA_Evolucao, etc.) exatamente como estava ...
const MA_Evolucao = {
    chart: null,
    renderizarGraficos: async function(periodo) {
        document.querySelectorAll('.chart-selector-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`chart-btn-${periodo}`).classList.add('active');
        const valData = document.getElementById('global-date').value; if(!valData) return;
        const [y, m, d] = valData.split('-').map(Number); const refDate = new Date(y, m-1, d);
        const ano = refDate.getFullYear(); const mes = refDate.getMonth();
        let dInicio, dFim;
        if (periodo === 'mes') { dInicio = new Date(ano, mes, 1).toISOString().split('T')[0]; dFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0]; } 
        else if (periodo === 'trimestre') { const trimStart = Math.floor(mes / 3) * 3; dInicio = new Date(ano, trimStart, 1).toISOString().split('T')[0]; dFim = new Date(ano, trimStart + 3, 0).toISOString().split('T')[0]; } 
        else if (periodo === 'semestre') { const semStart = mes < 6 ? 0 : 6; dInicio = new Date(ano, semStart, 1).toISOString().split('T')[0]; dFim = new Date(ano, semStart + 6, 0).toISOString().split('T')[0]; } 
        else if (periodo === 'ano') { dInicio = `${ano}-01-01`; dFim = `${ano}-12-31`; }
        
        let targetName = MA_Main.usersMap[MA_Main.sessao.id]; let viewingTime = false;
        if(MA_Main.isMgr) { const val = document.getElementById('filtro-user').value; if(val === 'time') viewingTime = true; else if(val !== 'me') targetName = MA_Main.usersMap[val]; }
        const { data: rawData } = await _supabase.from('producao').select('*').gte('data_referencia', dInicio).lte('data_referencia', dFim).order('data_referencia');
        const grouped = MA_Diario.normalizarDados(rawData || []); const agruparPorMes = (periodo === 'ano');
        const processedTime = {}, processedMain = {};
        Object.keys(grouped).sort().forEach(date => {
            let label = agruparPorMes ? date.substring(0, 7) : date; const prods = Object.values(grouped[date]); const total = prods.reduce((a,b) => a + b.quantidade, 0); const count = prods.length; const avg = count ? Math.round(total / count) : 0;
            if(!processedTime[label]) { processedTime[label] = {sum:0, cnt:0}; processedMain[label] = 0; } processedTime[label].sum += avg; processedTime[label].cnt++;
            let valUser = 0; if(grouped[date][targetName]) { valUser = grouped[date][targetName].quantidade; } processedMain[label] += valUser; 
        });
        const labels = Object.keys(processedTime).sort(); const dataMain = [], dataBench = []; let statsDias = 0, statsBest = 0, statsBatida = 0;
        labels.forEach(k => {
            let valTime = Math.round(processedTime[k].sum / processedTime[k].cnt); let valMainFinal = processedMain[k];
            if (agruparPorMes) valMainFinal = Math.round(valMainFinal / processedTime[k].cnt); 
            const displayMain = viewingTime ? valTime : valMainFinal; dataMain.push(displayMain); dataBench.push(viewingTime ? 650 : valTime);
            if(displayMain > 0) { statsDias++; if(displayMain > statsBest) statsBest = displayMain; if(displayMain >= 650) statsBatida++; }
        });
        document.getElementById('evo-dias').innerText = statsDias; document.getElementById('evo-taxa').innerText = statsDias ? Math.round((statsBatida/statsDias)*100) + '%' : '0%'; document.getElementById('evo-best').innerText = statsBest;
        const ctx = document.getElementById('chartPrincipal').getContext('2d'); if(this.chart) this.chart.destroy();
        const gradient = ctx.createLinearGradient(0, 0, 0, 400); gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)'); gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');
        this.chart = new Chart(ctx, { type: 'line', data: { labels: labels.map(k => agruparPorMes ? k.split('-').reverse().join('/') : k.split('-').reverse().slice(0, 2).join('/')), datasets: [ { label: viewingTime ? 'Média Equipa' : targetName, data: dataMain, borderColor: '#2563eb', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true }, { label: viewingTime ? 'Meta (650)' : 'Média Equipa', data: dataBench, borderColor: viewingTime ? '#10b981' : '#94a3b8', borderWidth: 2, borderDash: [6, 6], tension: 0.4, fill: false } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } } });
    }
};

const MA_Comparativo = {
    atualizar: async function(dadosFinais, viewingTime, targetName, inicio, fim) {
        const valL = document.getElementById('comp-media-user'); const valR = document.getElementById('comp-media-time'); const elMsg = document.getElementById('comp-mensagem');
        const { data: all } = await _supabase.from('producao').select('*').gte('data_referencia', inicio).lte('data_referencia', fim);
        const norm = MA_Diario.normalizarDados(all||[]); let sumMedias=0, cntDias=0;
        Object.values(norm).forEach(diaObj => { const arr = Object.values(diaObj); const tot = arr.reduce((a,b)=>a+b.quantidade,0); const headCount = arr.filter(p => p.quantidade > 0).length; if(headCount > 0) { sumMedias += (tot/headCount); cntDias++; } });
        const mediaGeral = cntDias ? Math.round(sumMedias/cntDias) : 0;
        const diasTrabUser = dadosFinais.filter(d => d.quantidade > 0); const totUser = diasTrabUser.reduce((a,b)=>a+b.quantidade,0); const mediaUser = diasTrabUser.length ? Math.round(totUser/diasTrabUser.length) : 0;
        valL.innerText = mediaUser; valR.innerText = viewingTime ? 650 : mediaGeral; 
        document.getElementById('label-media-selecionada').innerText = viewingTime ? "Média da Equipa" : `Média ${targetName}`;
        document.getElementById('label-media-benchmark').innerText = viewingTime ? "Meta Esperada" : "Média Geral da Equipa";
        const diff = mediaUser - (viewingTime ? 650 : mediaGeral);
        if (diff > 0) elMsg.innerHTML = `<span class="text-emerald-600 font-black text-xl">+${diff}</span> <span class="text-slate-400 text-sm font-normal">acima do esperado</span>`; else if (diff < 0) elMsg.innerHTML = `<span class="text-rose-500 font-black text-xl">${diff}</span> <span class="text-slate-400 text-sm font-normal">abaixo do esperado</span>`; else elMsg.innerHTML = `<span class="text-slate-500">Exatamente na média.</span>`;
    }
};

const MA_Feedback = {
    carregar: async function() {
        const el = document.getElementById('lista-feedbacks'); const { data } = await _supabase.from('feedbacks').select('*').order('created_at', {ascending:true});
        if(!data || !data.length) { el.innerHTML = '<div class="text-center text-slate-300 py-12">Nenhum feedback encontrado.</div>'; return; }
        let html=''; data.forEach(m => { const isPub = m.usuario_alvo_id === null; const isMe = m.usuario_alvo_id == MA_Main.sessao.id; const isMine = m.autor_nome === MA_Main.sessao.nome; if(isPub || isMe || isMine) { const align = isMine ? 'ml-auto bg-blue-600 text-white rounded-tr-none' : 'mr-auto bg-white text-slate-700 border border-slate-100 rounded-tl-none'; const subColor = isMine ? 'text-blue-200' : 'text-slate-400'; const badge = isPub ? '📢 TIME' : (isMine && m.usuario_alvo_id ? `🔒 ${MA_Main.usersMap[m.usuario_alvo_id]}` : '🔒 PRIVADO'); html += `<div class="max-w-[80%] p-4 rounded-2xl shadow-sm mb-4 ${align}"><div class="flex justify-between items-center mb-2 text-xs font-bold uppercase tracking-wide opacity-90"><span>${m.autor_nome} <span class="opacity-70 ml-1 scale-75 inline-block border border-current px-1 rounded">${badge}</span></span><span class="${subColor}">${new Date(m.created_at).toLocaleDateString()}</span></div><p class="leading-relaxed whitespace-pre-wrap font-medium">${m.mensagem}</p></div>`; } }); el.innerHTML = html; el.scrollTop = el.scrollHeight;
    },
    enviar: async function() { const txt = document.getElementById('input-feedback').value; const dest = document.getElementById('feedback-destinatario').value; if(!txt.trim()) return; const aid = dest !== 'time' ? parseInt(dest) : null; await _supabase.from('feedbacks').insert({ usuario_alvo_id: aid, autor_nome: MA_Main.sessao.nome, autor_funcao: MA_Main.sessao.funcao, mensagem: txt }); document.getElementById('input-feedback').value = ''; this.carregar(); }
};