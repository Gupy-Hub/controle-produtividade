const Geral = {
    listaAtual: [],
    selecionado: null,
    dataVisualizada: null,
    periodoInicio: null,
    periodoFim: null,

    toggleSemana: function() {
        const mode = document.getElementById('view-mode').value;
        const selSemana = document.getElementById('select-semana');
        
        if (mode === 'semana') {
            selSemana.classList.remove('hidden');
        } else {
            selSemana.classList.add('hidden');
        }
        this.carregarTela();
    },
    
    carregarTela: async function() {
        const modo = document.getElementById('view-mode').value;
        const globalInput = document.getElementById('global-date');
        // Fallback para hoje se não houver data global
        const isoDate = globalInput && globalInput.value ? globalInput.value : new Date().toISOString().split('T')[0];
        
        this.dataVisualizada = isoDate; 
        // Conversão segura de data (evita problemas de timezone UTC)
        const [ano, mes, dia] = isoDate.split('-').map(Number);

        const bulkSelect = document.getElementById('bulk-fator');
        if(bulkSelect) bulkSelect.value = "";

        let inicio, fim;
        
        if (modo === 'dia') { 
            inicio = isoDate; fim = isoDate; 
        } 
        else if (modo === 'mes') { 
            const dateIni = new Date(ano, mes - 1, 1);
            const dateFim = new Date(ano, mes, 0);
            inicio = dateIni.toLocaleDateString('en-CA'); 
            fim = dateFim.toLocaleDateString('en-CA');
        } 
        else if (modo === 'semana') {
            const numSemana = parseInt(document.getElementById('select-semana').value) || 1;
            const ultimoDiaMes = new Date(ano, mes, 0).getDate();
            
            let semanaAtual = 1;
            let dataIniSemana = null;
            let dataFimSemana = null;

            // Percorre o mês dia a dia para identificar a semana corretamente
            for (let d = 1; d <= ultimoDiaMes; d++) {
                const dataLoop = new Date(ano, mes - 1, d);
                const diaSemana = dataLoop.getDay(); // 0=Dom, 6=Sab

                // Se o dia pertence à semana selecionada, registra limites
                if (semanaAtual === numSemana) {
                    if (!dataIniSemana) dataIniSemana = new Date(dataLoop);
                    dataFimSemana = new Date(dataLoop);
                }

                // Sábado encerra a semana corrente no calendário
                if (diaSemana === 6) {
                    semanaAtual++;
                }

                // Se já passamos da semana desejada, paramos o loop
                if (semanaAtual > numSemana) break;
            }

            // Se encontrou datas válidas para a semana
            if (dataIniSemana && dataFimSemana) {
                inicio = dataIniSemana.toLocaleDateString('en-CA');
                fim = dataFimSemana.toLocaleDateString('en-CA');
            } else {
                // Fallback (ex: selecionou semana 5 num mês que só tem 4)
                // Define intervalo inválido ou o próprio dia para não quebrar
                inicio = isoDate; fim = isoDate;
            }
        }

        this.periodoInicio = inicio;
        this.periodoFim = fim;

        const { data } = await _supabase
            .from('producao')
            .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc') 
            .gte('data_referencia', inicio)
            .lte('data_referencia', fim);
            
        let dadosFiltrados = data || [];
        // Normaliza e agrupa os dados
        this.listaAtual = Sistema.Dados.normalizar(dadosFiltrados);
        this.renderizar();
    },

    contarDiasUteis: function(inicioStr, fimStr) {
        if(!inicioStr || !fimStr) return 0;
        
        let count = 0;
        // Adiciona T12:00:00 para evitar problemas de fuso horário voltando 1 dia
        let cur = new Date(inicioStr + 'T12:00:00');
        const end = new Date(fimStr + 'T12:00:00');
        
        // Loop de segurança para não travar navegador
        let safety = 0;
        while(cur <= end && safety < 366) {
            const d = cur.getDay();
            // Conta apenas se não for Domingo (0) nem Sábado (6)
            if(d !== 0 && d !== 6) {
                count++;
            }
            cur.setDate(cur.getDate() + 1);
            safety++;
        }
        return count; // Pode retornar 0 se a semana só tiver fds
    },

    mudarFator: function(nome, valor) {
        const modo = document.getElementById('view-mode').value;
        if (modo !== 'dia') {
            alert("Atenção: Altere o fator apenas visualizando o 'Dia' específico para garantir o histórico correto.");
            this.renderizar(); 
            return;
        }
        Sistema.Dados.definirFator(nome, this.dataVisualizada, valor);
        this.carregarTela();
    },

    mudarFatorTodos: function(valor) {
        if (!valor) return; 
        const modo = document.getElementById('view-mode').value;
        if (modo !== 'dia') {
            alert("Atenção: A alteração em massa só é permitida na visão 'Apenas o Dia'.");
            document.getElementById('bulk-fator').value = "";
            return;
        }
        if (!confirm("Tem certeza que deseja aplicar este fator para TODAS as assistentes listadas?")) {
            document.getElementById('bulk-fator').value = "";
            return;
        }
        this.listaAtual.forEach(u => {
            if (!u.inativo) {
                Sistema.Dados.definirFator(u.nome, this.dataVisualizada, valor);
            }
        });
        this.carregarTela(); 
    },

    selecionar: function(nome) {
        if (this.selecionado === nome) this.selecionado = null; else this.selecionado = nome;
        this.renderizar();
    },
    limparSelecao: function() { this.selecionado = null; this.renderizar(); },

    renderizar: function() {
        const tbody = document.getElementById('tabela-corpo'); 
        if(!tbody) return;
        tbody.innerHTML = '';
        const modo = document.getElementById('view-mode').value;

        // Controle do Select em Massa
        const bulkSelect = document.getElementById('bulk-fator');
        if (bulkSelect) {
            if (modo !== 'dia') {
                bulkSelect.disabled = true;
                bulkSelect.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                bulkSelect.disabled = false;
                bulkSelect.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        const ativos = this.listaAtual.filter(u => !u.inativo);
        const baseCalculo = this.selecionado ? this.listaAtual.filter(u => u.nome === this.selecionado) : ativos;
        const totalProd = baseCalculo.reduce((a, b) => a + b.total, 0);

        // Lógica de Abonados/Meio Período (Apenas visualização DIÁRIA)
        let qtdMeio = 0; let qtdAbonado = 0;
        if (modo === 'dia' && !this.selecionado) {
            this.listaAtual.forEach(u => {
                const diaInfo = u.diasMap[this.dataVisualizada];
                if (diaInfo) { 
                    if (diaInfo.fator === 0.5) qtdMeio++; 
                    else if (diaInfo.fator === 0) qtdAbonado++; 
                }
            });
        }
        
        let hcConsiderado = this.selecionado ? 1 : ativos.length;
        if (!this.selecionado && modo === 'dia') {
            const reducaoParesMeio = Math.floor(qtdMeio / 2);
            const reducaoAbonados = qtdAbonado;
            hcConsiderado = ativos.length - reducaoAbonados - reducaoParesMeio;
        }

        // --- CÁLCULO DE META CORRIGIDO ---
        let diasUteisPeriodo = this.contarDiasUteis(this.periodoInicio, this.periodoFim);
        // Garante ao menos 1 dia para evitar divisão por zero, exceto se realmente for 0 (ex: selecionou sábado)
        if (diasUteisPeriodo === 0 && modo === 'dia') {
           // Se selecionou um sábado/domingo, diasUteis é 0. Meta deveria ser 0.
        }

        const metaDiaria = 650;
        const metaTotalEsperada = diasUteisPeriodo * hcConsiderado * metaDiaria;
        const metaMediaIndividual = diasUteisPeriodo * metaDiaria;
        
        // Média Real: Produção total / (HC ajustado * dias uteis) ou apenas / HC se for visão macro
        // Na visão original: KPI Média = Produção Total / HC Considerado (Média acumulada do período por pessoa)
        const mediaRealAnalista = hcConsiderado ? Math.round(totalProd / hcConsiderado) : 0;
        
        // Atualiza Labels de Dias
        let diasDisplay = 0;
        let diasLabel = "";
        if (this.selecionado) {
            diasDisplay = baseCalculo.length ? baseCalculo[0].dias : 0; 
            diasLabel = "Dias do Colaborador";
        } else {
            // Se for mês/semana, mostra dias úteis do calendário. Se dia, mostra 1.
            diasDisplay = diasUteisPeriodo;
            diasLabel = "Dias Úteis (Calendário)";
        }

        // Info Abonados
        const elInfoAbonados = document.getElementById('info-abonados');
        if(elInfoAbonados) {
            elInfoAbonados.classList.add('hidden'); 
            if ((qtdMeio > 0 || qtdAbonado > 0) && modo === 'dia' && !this.selecionado) {
                let texto = [];
                if (qtdMeio > 0) texto.push(`${qtdMeio} Meio Período`);
                if (qtdAbonado > 0) texto.push(`${qtdAbonado} Abonado(s)`);
                elInfoAbonados.innerText = texto.join(', ');
                elInfoAbonados.classList.remove('hidden');
            }
        }

        // Atualiza KPIs
        document.getElementById('kpi-hc').innerText = hcConsiderado;
        document.getElementById('kpi-dias').innerText = diasDisplay;
        document.getElementById('kpi-dias-label').innerText = diasLabel;
        document.getElementById('kpi-total').innerText = totalProd.toLocaleString();
        document.getElementById('kpi-meta-total').innerText = metaTotalEsperada.toLocaleString();
        document.getElementById('bar-prod').style.width = Math.min((totalProd/(metaTotalEsperada||1))*100, 100) + '%';
        document.getElementById('kpi-media').innerText = mediaRealAnalista.toLocaleString();
        document.getElementById('kpi-meta-media').innerText = metaMediaIndividual.toLocaleString();
        document.getElementById('bar-media').style.width = Math.min((mediaRealAnalista/(metaMediaIndividual||1))*100, 100) + '%';

        const percentual = metaTotalEsperada > 0 ? Math.round((totalProd / metaTotalEsperada) * 100) : 0;
        document.getElementById('kpi-pct').innerText = percentual + '%';
        document.getElementById('kpi-pct-detail').innerText = `${totalProd.toLocaleString()} / ${metaTotalEsperada.toLocaleString()}`;
        
        const cardPct = document.getElementById('card-pct');
        const iconPct = document.getElementById('icon-pct');
        if (cardPct) {
            cardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
            if (percentual < 100) {
                cardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-times-circle text-white/50"></i>';
            } else {
                cardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-check-circle text-white/50"></i>';
            }
        }

        const selHeader = document.getElementById('selection-header');
        if (this.selecionado) { selHeader.classList.remove('hidden'); document.getElementById('selected-name').innerText = this.selecionado; } 
        else selHeader.classList.add('hidden');

        if(this.listaAtual.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-slate-400">Sem dados.</td></tr>'; return; }

        this.listaAtual.forEach(u => {
            const isSelected = this.selecionado === u.nome;
            const rowClass = isSelected ? "selected-row" : "hover:bg-slate-50";
            const opacity = u.inativo ? "row-ignored" : "";
            
            let fator = 1;
            if (modo === 'dia') {
                 const infoDia = u.diasMap[this.dataVisualizada];
                 fator = infoDia ? infoDia.fator : 1;
            } else {
                 fator = 1; 
            }
            const fatorClass = fator === 1 ? 'st-1' : (fator === 0.5 ? 'st-05' : 'st-0');
            const disabled = modo !== 'dia' ? 'disabled opacity-50 cursor-not-allowed' : '';

            const selectHtml = `<select class="status-select ${fatorClass} ${disabled}" onclick="event.stopPropagation()" onchange="Geral.mudarFator('${u.nome}', this.value)"><option value="1" ${fator===1?'selected':''}>100%</option><option value="0.5" ${fator===0.5?'selected':''}>50%</option><option value="0" ${fator===0?'selected':''}>0%</option></select>`;
            const pctIndividual = u.meta > 0 ? Math.round((u.total / u.meta) * 100) : 0;
            let badgeClass = pctIndividual >= 100 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200';
            const pctBadge = `<span class="${badgeClass} px-2 py-1 rounded text-xs font-bold border">${pctIndividual}%</span>`;

            tbody.innerHTML += `<tr class="${rowClass} ${opacity} transition border-b border-slate-100 cursor-pointer"><td class="px-4 py-4 text-center">${selectHtml}</td><td class="px-6 py-4 font-bold text-slate-700" onclick="Geral.selecionar('${u.nome}')">${u.nome}</td><td class="px-6 py-4 text-center text-slate-500">${u.dias}</td><td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td><td class="px-6 py-4 text-center text-slate-600">${u.fifo}</td><td class="px-6 py-4 text-center text-slate-600">${u.gt}</td><td class="px-6 py-4 text-center text-slate-600">${u.gp}</td><td class="px-6 py-4 text-center text-slate-400">${u.meta.toLocaleString()}</td><td class="px-6 py-4 text-center">${pctBadge}</td></tr>`;
        });
    }
};