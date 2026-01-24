/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Engine do Painel "Dia a Dia" (Minha Área)
   CORREÇÃO: Nome da coluna de metas (meta_producao) e agregação de equipe.
*/

MinhaArea.Geral = {
    carregar: async function() {
        const uid = MinhaArea.getUsuarioAlvo(); // null = Visão Geral da Equipe
        const tbody = document.getElementById('tabela-extrato');
        
        // Limpa alertas anteriores
        const alertContainer = document.getElementById('container-checkin-alert');
        if (alertContainer) {
            alertContainer.innerHTML = '';
            alertContainer.classList.add('hidden');
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-20 text-slate-400 bg-slate-50/50"><div class="flex flex-col items-center gap-2"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i><span class="text-xs font-bold">Consolidando dados da produção...</span></div></td></tr>';

        try {
            const dtInicio = new Date(inicio + 'T12:00:00');
            const dtFim = new Date(fim + 'T12:00:00');
            const anoInicio = dtInicio.getFullYear();
            const anoFim = dtFim.getFullYear();

            // 1. Buscas de Dados (Paralelas)
            const promises = [
                // A. Produção
                Sistema.supabase.from('producao')
                    .select('usuario_id, data_referencia, quantidade, fator, fifo, gradual_total, gradual_parcial, justificativa, justificativa_abono, justificativas')
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim)
                    .limit(5000), // Aumentado para garantir todos os dias/users
                
                // B. Metas (CORRIGIDO: meta_producao)
                Sistema.supabase.from('metas')
                    .select('usuario_id, mes, ano, meta_producao, meta_assertividade')
                    .gte('ano', anoInicio)
                    .lte('ano', anoFim),
                
                // C. Usuários (Para saber quem é da equipe)
                Sistema.supabase.from('usuarios').select('id, funcao, nome'),
                
                // D. Assertividade
                Sistema.supabase.from('assertividade')
                    .select('usuario_id, data_referencia, porcentagem_assertividade')
                    .gte('data_referencia', inicio)
                    .lte('data_referencia', fim)
                    .not('porcentagem_assertividade', 'is', null)
                    .limit(5000)
            ];

            // Se for individual, busca checkins
            if (uid && uid == MinhaArea.usuario.id) {
                promises.push(Sistema.supabase.from('checking_diario').select('*').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim));
            } else {
                promises.push(Promise.resolve({data:[]}));
            }

            const [prodRes, metasRes, usersRes, assertRes, checkRes] = await Promise.all(promises);

            if (prodRes.error) throw prodRes.error;
            if (metasRes.error) throw metasRes.error;

            // 2. Preparação dos Dados
            const dadosProducao = prodRes.data || [];
            const dadosMetas = metasRes.data || [];
            const dadosUsuarios = usersRes.data || [];
            const dadosAssert = assertRes.data || [];
            const dadosCheckins = checkRes.data || [];

            // Identificar IDs Relevantes
            const usersComProducao = new Set();
            dadosProducao.forEach(p => { if(Number(p.quantidade) > 0) usersComProducao.add(p.usuario_id); });

            let targetUserIds = [];
            if (uid) {
                // Visão Individual
                targetUserIds = [parseInt(uid)];
            } else {
                // Visão Geral: Todos os assistentes + Admins que produziram
                targetUserIds = dadosUsuarios.filter(u => {
                    const cargo = (u.funcao || '').toUpperCase();
                    const isGestao = ['AUDITORA', 'GESTORA', 'ADMINISTRADOR', 'ADMIN'].includes(cargo);
                    return !isGestao || usersComProducao.has(u.id);
                }).map(u => u.id);
            }
            const targetSet = new Set(targetUserIds);

            // Mapear Produção [Data][UserID] -> Registro
            const mapProd = {};
            dadosProducao.forEach(p => {
                if (!targetSet.has(p.usuario_id)) return;
                if (!mapProd[p.data_referencia]) mapProd[p.data_referencia] = {};
                mapProd[p.data_referencia][p.usuario_id] = p;
            });

            // Mapear Assertividade [Data] -> {soma, qtd}
            const mapAssert = {};
            dadosAssert.forEach(a => {
                if (!targetSet.has(a.usuario_id)) return;
                if (!mapAssert[a.data_referencia]) mapAssert[a.data_referencia] = { soma: 0, qtd: 0 };
                
                const val = this.parseValorPorcentagem(a.porcentagem_assertividade);
                mapAssert[a.data_referencia].soma += val;
                mapAssert[a.data_referencia].qtd++;
            });

            // Helpers para Metas
            const getMeta = (userId, ano, mes) => {
                const m = dadosMetas.find(x => x.usuario_id == userId && x.ano == ano && x.mes == mes);
                // CORREÇÃO CRÍTICA: Ler meta_producao, fallback 650
                return m ? Number(m.meta_producao) : 650;
            };

            const getMetaAssert = (userId, ano, mes) => {
                const m = dadosMetas.find(x => x.usuario_id == userId && x.ano == ano && x.mes == mes);
                return m ? Number(m.meta_assertividade) : 98.0;
            };

            // Checking
            const mapCheckins = new Set();
            dadosCheckins.forEach(c => mapCheckins.add(c.data_referencia));
            if (uid && uid == MinhaArea.usuario.id) this.processarCheckingInterface(uid, dadosCheckins);

            // 3. Loop do Calendário (Construção da Grid)
            const listaGrid = [];
            let kpiTotalProd = 0;
            let kpiTotalMeta = 0;
            let kpiSomaFator = 0; // Man-Days
            let kpiAssertSoma = 0, kpiAssertQtd = 0;

            for (let d = new Date(dtInicio); d <= dtFim; d.setDate(d.getDate() + 1)) {
                if (d.getDay() === 0 || d.getDay() === 6) continue; // Pula FDS na grid

                const dataStr = d.toISOString().split('T')[0];
                const ano = d.getFullYear();
                const mes = d.getMonth() + 1;

                let diaProd = 0;
                let diaMeta = 0;
                let diaFatorSoma = 0;
                let diaCount = 0;
                
                // Detalhes para quando é individual
                let lastFifo = 0, lastGt = 0, lastGp = 0, lastJust = '';

                targetUserIds.forEach(idUser => {
                    const reg = mapProd[dataStr]?.[idUser];
                    
                    const qtd = reg ? Number(reg.quantidade || 0) : 0;
                    // Se tem registro, usa o fator dele. Se não tem, e é dia útil, assume 1.0 (Meta Cheia)
                    // Mas se não produziu nada, normalmente fator é 1, a menos que tenha abono.
                    let fator = (reg && reg.fator !== null) ? Number(reg.fator) : 1.0;
                    
                    diaProd += qtd;
                    
                    // A meta individual é: MetaMensalUsuario * FatorUsuario
                    const metaBaseUser = getMeta(idUser, ano, mes);
                    diaMeta += Math.round(metaBaseUser * fator);

                    diaFatorSoma += fator;
                    if (reg || qtd > 0) diaCount++; // Contar presença

                    if (uid && reg) {
                        lastFifo = reg.fifo; lastGt = reg.gradual_total; lastGp = reg.gradual_parcial;
                        lastJust = reg.justificativa || reg.justificativa_abono || reg.justificativas || '';
                    }
                });

                kpiTotalProd += diaProd;
                kpiTotalMeta += diaMeta;
                kpiSomaFator += diaFatorSoma;

                // Assertividade do Dia (Média da equipe no dia)
                const assertDia = mapAssert[dataStr];
                let assertDisplay = { text: '-', class: 'text-slate-300' };
                if (assertDia && assertDia.qtd > 0) {
                    const media = assertDia.soma / assertDia.qtd;
                    kpiAssertSoma += assertDia.soma;
                    kpiAssertQtd += assertDia.qtd;
                    assertDisplay.text = media.toFixed(2) + '%';
                    assertDisplay.class = media >= 98 ? 'text-emerald-600 font-bold bg-emerald-50 px-1 rounded' : 'text-rose-600 font-bold bg-rose-50 px-1 rounded';
                }

                // Push na Grid
                // Exibir se: Tiver produção OU Meta > 0 (dia útil) OU for visão individual (calendário completo)
                const fatorExibicao = uid ? diaFatorSoma : (diaCount > 0 ? (diaFatorSoma/diaCount) : 1.0); // Média na geral

                listaGrid.push({
                    data: dataStr,
                    fator: fatorExibicao,
                    qtd: diaProd,
                    metaDia: diaMeta,
                    metaConfigAssert: 98,
                    assertDisplay: assertDisplay,
                    justificativa: uid ? lastJust : '',
                    fifo: lastFifo, gt: lastGt, gp: lastGp,
                    validado: mapCheckins.has(dataStr)
                });
            }

            listaGrid.sort((a, b) => b.data.localeCompare(a.data));

            // 4. Renderização HTML
            if(tbody) tbody.innerHTML = '';
            
            if (listaGrid.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="text-center py-12 text-slate-400 italic">Nenhum registro encontrado.</td></tr>';
            }

            listaGrid.forEach(item => {
                const pct = item.metaDia > 0 ? (item.qtd / item.metaDia) * 100 : 0;
                let cor = pct >= 100 ? 'text-emerald-600 font-bold' : (pct >= 80 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold');
                
                const [ano, mes, dia] = item.data.split('-');
                const dateObj = new Date(item.data + 'T12:00:00');
                const diaSemana = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '');
                const iconCheck = item.validado ? '<i class="fas fa-check-circle text-emerald-500 ml-1"></i>' : '';

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                        <td class="px-3 py-2 border-r border-slate-100 font-bold text-slate-700 bg-slate-50/30">
                            <span class="text-[9px] text-slate-400 font-normal mr-1 w-6 inline-block">${diaSemana}</span>${dia}/${mes}/${ano} ${iconCheck}
                        </td>
                        <td class="px-2 py-2 border-r text-center">${item.fator.toFixed(2)}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.fifo||0}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.gt||0}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${item.gp||0}</td>
                        <td class="px-2 py-2 border-r text-center font-black text-blue-700 bg-blue-50/10">${this.fmtNum(item.qtd)}</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">${this.fmtNum(item.metaDia)}</td>
                        <td class="px-2 py-2 border-r text-center ${cor}">${pct.toFixed(1)}%</td>
                        <td class="px-2 py-2 border-r text-center text-slate-400">98%</td>
                        <td class="px-2 py-2 border-r text-center"><span class="${item.assertDisplay.class}">${item.assertDisplay.text}</span></td>
                        <td class="px-2 py-2 truncate max-w-[150px] text-slate-400 italic">${item.justificativa}</td>
                    </tr>`;
            });

            // 5. KPIs de Topo
            this.setTxt('kpi-total', this.fmtNum(kpiTotalProd));
            this.setTxt('kpi-meta-acumulada', this.fmtNum(kpiTotalMeta));
            
            const pctGlobal = kpiTotalMeta > 0 ? (kpiTotalProd / kpiTotalMeta) * 100 : 0;
            this.setTxt('kpi-pct', pctGlobal.toFixed(2) + '%');
            const barVolume = document.getElementById('bar-volume');
            if(barVolume) barVolume.style.width = `${Math.min(pctGlobal, 100)}%`;

            const mediaAssert = kpiAssertQtd > 0 ? (kpiAssertSoma / kpiAssertQtd) : 0;
            this.setTxt('kpi-assertividade-val', mediaAssert.toFixed(2) + '%');

            this.setTxt('kpi-dias', this.fmtNum(kpiSomaFator)); // Dias Produtivos (Man-Days se geral)
            const diasUteisPeriodo = this.calcularDiasUteisMes(inicio, fim);
            this.setTxt('kpi-dias-uteis', diasUteisPeriodo);

            const pctDias = diasUteisPeriodo > 0 ? (kpiSomaFator / diasUteisPeriodo) * 100 : 0; // Exibe proporção
            if (uid) {
                // Se individual, barra de dias é % de presença
                 const barDias = document.getElementById('bar-dias');
                 if(barDias) barDias.style.width = `${Math.min(pctDias, 100)}%`;
            }

            // Velocidade e Meta Diária
            // Velocidade = Total Produção / Total Dias Trabalhados (Soma Fator)
            const divisorVel = kpiSomaFator > 0 ? kpiSomaFator : 1;
            const veloc = Math.round(kpiTotalProd / divisorVel);
            
            // Meta Diária de Referência: Média das metas individuais
            // (Para saber se estamos rápidos ou lentos em relação ao esperado por dia/pessoa)
            let metaRef = 650;
            if (targetUserIds.length > 0) {
                let somaMetaBase = 0;
                // Pega meta do último mês do período
                const mesRef = new Date(dtFim).getMonth() + 1;
                const anoRef = new Date(dtFim).getFullYear();
                
                targetUserIds.forEach(uid => {
                    somaMetaBase += getMeta(uid, anoRef, mesRef);
                });
                // Se for geral, a "Meta Dia" exibida nos KPIs é a capacidade total da equipe por dia?
                // Ou a média por pessoa? O KPI 'kpi-media' é velocidade.
                // Se 'veloc' é TotalProd / ManDays, então é velocidade PER CAPITA DIA.
                // Logo, a metaRef deve ser a média per capita.
                metaRef = Math.round(somaMetaBase / targetUserIds.length);
            }
            
            const pctVel = metaRef > 0 ? (veloc / metaRef) * 100 : 0;
            const elMedia = document.getElementById('kpi-media');
            if(elMedia) elMedia.innerHTML = `${veloc} <span class="text-slate-300 mx-1">/</span> <span class="${pctVel >= 100 ? 'text-emerald-500' : 'text-amber-500'}">${pctVel.toFixed(0)}%</span>`;
            this.setTxt('kpi-meta-dia', metaRef);

        } catch (err) {
            console.error("Erro Geral:", err);
            if(tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center py-