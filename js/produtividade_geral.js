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
    
    // --- NOVA FUNÇÃO DE EXCLUSÃO (Esta é a função que o erro diz estar faltando) ---
    excluirDadosDia: async function() {
        const modo = document.getElementById('view-mode').value;
        if (modo !== 'dia') {
            alert("Para excluir dados, selecione o modo de visualização 'Apenas o Dia' no filtro 'Visualizar'.");
            return;
        }
        
        // Garante que a data está definida e formatada
        const data = this.dataVisualizada;
        // Prevenção caso dataVisualizada esteja nula
        if (!data) { alert("Data não selecionada."); return; }
        
        const [ano, mes, dia] = data.split('-');
        const dataFmt = `${dia}/${mes}/${ano}`;

        if (!confirm(`ATENÇÃO: Você está prestes a EXCLUIR TODOS os lançamentos do dia ${dataFmt}.\n\nEsta ação é irreversível e geralmente usada para corrigir importações feitas na data errada.\n\nTem certeza absoluta?`)) {
            return;
        }

        try {
            const { error } = await _supabase
                .from('producao')
                .delete()
                .eq('data_referencia', data);

            if (error) throw error;

            alert('Dados excluídos com sucesso!');
            this.carregarTela(); // Atualiza a tela para mostrar vazio

        } catch (e) {
            console.error(e);
            alert('Erro ao excluir dados: ' + e.message);
        }
    },
    
    carregarTela: async function() {
        const modo = document.getElementById('view-mode').value;
        const globalInput = document.getElementById('global-date');
        const isoDate = globalInput && globalInput.value ? globalInput.value : new Date().toISOString().split('T')[0];
        
        this.dataVisualizada = isoDate; 
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

            for (let d = 1; d <= ultimoDiaMes; d++) {
                const dataLoop = new Date(ano, mes - 1, d);
                const diaSemana = dataLoop.getDay(); 

                if (semanaAtual === numSemana) {
                    if (!dataIniSemana) dataIniSemana = new Date(dataLoop);
                    dataFimSemana = new Date(dataLoop);
                }

                if (diaSemana === 6) {
                    semanaAtual++;
                }
                if (semanaAtual > numSemana) break;
            }

            if (dataIniSemana && dataFimSemana) {
                inicio = dataIniSemana.toLocaleDateString('en-CA');
                fim = dataFimSemana.toLocaleDateString('en-CA');
            } else {
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
        this.listaAtual = Sistema.Dados.normalizar(dadosFiltrados);
        this.renderizar();
    },

    contarDiasUteis: function(inicioStr, fimStr) {
        if(!inicioStr || !fimStr) return 0;
        let count = 0;
        let cur = new Date(inicioStr + 'T12:00:00');
        const end = new Date(fimStr + 'T12:00:00');
        let safety = 0;
        while(cur <= end && safety < 366) {
            const d = cur.getDay();
            if(d !== 0 && d !== 6) count++;
            cur.setDate(cur.getDate() + 1);
            safety++;
        }
        return count; 
    },

    mudarFator: function(nome, valor) {
        const modo = document.getElementById('view-mode').value;
        if (modo !== 'dia') {
            alert("Atenção: Altere o fator apenas visualizando o 'Dia' específico.");
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

        // Configuração do Bulk Select
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
        
        // Total Produção
        const totalProd = this.selecionado 
            ? this.listaAtual.filter(u => u.nome === this.selecionado).reduce((a, b) => a + b.total, 0)
            : ativos.reduce((a, b) => a + b.total, 0);

        // --- LÓGICA DE HEADCOUNT ---
        let hcConsiderado = 0;
        let diasDisplay = 0;
        let diasLabel = "";
        const diasUteisPeriodo = this.contarDiasUteis(this.periodoInicio, this.periodoFim);

        if (modo === 'dia') {
            // Lógica Dia
            let qtdMeio = 0; let qtdAbonado = 0;
            this.listaAtual.forEach(u => {
                const diaInfo = u.diasMap[this.dataVisualizada];
                if (diaInfo) { 
                    if (diaInfo.fator === 0.5) qtdMeio++; 
                    else if (diaInfo.fator === 0) qtdAbonado++; 
                }
            });
            
            if (this.selecionado) {
                hcConsiderado = 1;
                diasLabel = "Assistente Selecionada";
            } else {
                const reducaoParesMeio = Math.floor(qtdMeio / 2);
                hcConsiderado = ativos.length - qtdAbonado - reducaoParesMeio;
                diasLabel = "Ativos (Dia)";
            }
            diasDisplay = diasUteisPeriodo;

            document.getElementById('kpi-hc').innerText = hcConsiderado;
            
            const elInfoAbonados = document.getElementById('info-abonados');
            if(elInfoAbonados) {
                elInfoAbonados.classList.add('hidden'); 
                if ((qtdMeio > 0 || qtdAbonado > 0) && !this.selecionado) {
                    let texto = [];
                    if (qtdMeio > 0) texto.push(`${qtdMeio} Meio Período`);
                    if (qtdAbonado > 0) texto.push(`${qtdAbonado} Abonado(s)`);
                    elInfoAbonados.innerText = texto.join(', ');
                    elInfoAbonados.classList.remove('hidden');
                }
            }

        } else {
            // Lógica Mensal/Semanal
            const hcManual = Sistema.Dados.obterBaseHC(this.dataVisualizada);
            
            if (this.selecionado) {
                hcConsiderado = 1;
                diasDisplay = this.listaAtual.filter(u => u.nome === this.selecionado)[0]?.dias || 0;
                diasLabel = "Dias do Colaborador";
                document.getElementById('kpi-hc').innerText = "1";
            } else {
                hcConsiderado = hcManual;
                diasDisplay = diasUteisPeriodo;
                diasLabel = "Dias Úteis (Calendário)";
                document.getElementById('kpi-hc').innerHTML = `${hcManual} <span class="text-[10px] text-slate-400 font-normal">Base Definida</span>`;
            }
            
            const elInfoAbonados = document.getElementById('info-abonados');
            if(elInfoAbonados) elInfoAbonados.classList.add('hidden');
        }

        document.getElementById('kpi-dias').innerText = diasDisplay;
        document.getElementById('kpi-dias-label').innerText = diasLabel;
        
        // --- CÁLCULOS FINANCEIROS/METAS ---
        const metaDiaria = 650;
        
        const metaTotalEsperada = diasUteisPeriodo * hcConsiderado * metaDiaria;
        const metaMediaIndividual = diasUteisPeriodo * metaDiaria;
        
        const mediaRealAnalista = hcConsiderado ? Math.round(totalProd / hcConsiderado) : 0;

        document.getElementById('kpi-total').innerText = totalProd.toLocaleString();
        document.getElementById('kpi-meta-total').innerText = metaTotalEsperada.toLocaleString();
        
        document.getElementById('kpi-media').innerText = mediaRealAnalista.toLocaleString();
        document.getElementById('kpi-meta-media').innerText = metaMediaIndividual.toLocaleString();

        const percentual = metaTotalEsperada > 0 ? Math.round((totalProd / metaTotalEsperada) * 100) : 0;
        document.getElementById('kpi-pct').innerText = percentual + '%';
        document.getElementById('kpi-pct-detail').innerText = `${totalProd.toLocaleString()} / ${metaTotalEsperada.toLocaleString()}`;
        
        const cardPct = document.getElementById('card-pct');
        const iconPct = document.getElementById('icon-pct');
        if (cardPct) {
            cardPct.classList.remove('from-indigo-600', 'to-blue-700', 'from-red-600', 'to-rose-700', 'shadow-blue-200', 'shadow-rose-200');
            if (percentual < 100) {
                cardPct.classList.add('from-red-600', 'to-rose-700', 'shadow-rose-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-times-circle text-xl text-white/50"></i>';
            } else {
                cardPct.classList.add('from-indigo-600', 'to-blue-700', 'shadow-blue-200');
                if(iconPct) iconPct.innerHTML = '<i class="fas fa-check-circle text-xl text-white/50"></i>';
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