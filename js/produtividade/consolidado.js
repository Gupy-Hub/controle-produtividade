Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    basesManuaisHC: {}, 
    dadosCalculados: null, 

    // --- FUNÇÕES UTILITÁRIAS ---

    getSemanasDoMes: function(ano, mes) {
        let semanas = [];
        let dataAtual = new Date(ano, mes - 1, 1);
        const ultimoDiaMes = new Date(ano, mes, 0);

        while (dataAtual <= ultimoDiaMes) {
            let inicio = new Date(dataAtual);
            let fim = new Date(dataAtual);
            // Avança até o próximo Domingo ou fim do mês
            while (fim.getDay() !== 0 && fim < ultimoDiaMes) {
                fim.setDate(fim.getDate() + 1);
            }
            semanas.push({
                inicio: inicio.toISOString().split('T')[0],
                fim: fim.toISOString().split('T')[0]
            });
            dataAtual = new Date(fim);
            dataAtual.setDate(dataAtual.getDate() + 1);
        }
        return semanas;
    },

    // Calcula dias úteis totais do período (calendário cheio)
    calcularDiasUteisCalendario: function(dataInicio, dataFim) {
        let count = 0;
        let cur = new Date(dataInicio + 'T12:00:00'); 
        const end = new Date(dataFim + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    },

    // Calcula dias úteis APENAS até hoje (para médias reais de produtividade)
    calcularDiasUteisDecorridos: function(dataInicio, dataFim) {
        const hoje = new Date();
        hoje.setHours(12,0,0,0); 
        
        let inicio = new Date(dataInicio + 'T12:00:00');
        let fim = new Date(dataFim + 'T12:00:00');
        
        // Se o período começa no futuro
        if (inicio > hoje) return 0;

        // Se o fim do período é no futuro, corta no dia de hoje
        if (fim > hoje) fim = hoje;

        let count = 0;
        while (inicio <= fim) {
            const day = inicio.getDay();
            if (day !== 0 && day !== 6) count++;
            inicio.setDate(inicio.getDate() + 1);
        }
        return count;
    },

    // --- LÓGICA DO MÓDULO ---
    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        setTimeout(() => this.togglePeriodo(), 100);
    },

    mudarBasePeriodo: function(colIndex, novoValor) {
        if(!novoValor || novoValor < 0) return;
        this.basesManuaisHC[colIndex] = parseFloat(novoValor); 
        
        if(this.dadosCalculados) {
            this.renderizar(this.dadosCalculados);
        }
    },

    togglePeriodo: function() {
        const typeEl = document.getElementById('cons-period-type');
        if(!typeEl) return; 

        const t = typeEl.value;
        const selQ = document.getElementById('cons-select-quarter');
        const selS = document.getElementById('cons-select-semester');
        const dateInput = document.getElementById('global-date');
        
        this.basesManuaisHC = {}; 
        
        if(selQ) selQ.classList.add('hidden');
        if(selS) selS.classList.add('hidden');

        if (t === 'trimestre' && selQ) {
            selQ.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selQ.value = Math.ceil(m / 3);
            }
        } 
        else if (t === 'semestre' && selS) {
            selS.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selS.value = m <= 6 ? 1 : 2;
            }
        }
        
        this.carregar(false); 
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const typeEl = document.getElementById('cons-period-type');
        const dateInput = document.getElementById('global-date');
        
        if(!tbody || !typeEl || !dateInput) return;

        const t = typeEl.value;
        let val = dateInput.value || new Date().toISOString().split('T')[0];
        let [ano, mes, dia] = val.split('-').map(Number);
        const sAno = String(ano); const sMes = String(mes).padStart(2, '0');
        
        let s, e;
        
        if (t === 'dia' || t === 'mes') { 
            s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        } else if (t === 'trimestre') { 
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3); 
            const mStart = ((trim-1)*3)+1; 
            s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; 
        } else if (t === 'semestre') { 
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2); 
            s = sem === 1 ? `${sAno}-01-01` : `${sAno}-06-30`; 
            e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; 
        } else { // ano
            s = `${sAno}-01-01`; e = `${sAno}-12-31`; 
        }

        const cacheKey = `${t}_${s}_${e}`;
        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.processarEExibir(this.ultimoCache.data, t, mes, ano);
            return;
        }

        tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        try {
            if (!Produtividade.supabase) throw new Error("Banco de dados não conectado.");

            const { data: rawData, error } = await Produtividade.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e);
                
            if(error) throw error;
            
            this.ultimoCache = { key: cacheKey, data: rawData, tipo: t, mes: mes, ano: ano };
            this.processarEExibir(rawData, t, mes, ano);
            
        } catch (e) { 
            console.error("Erro Consolidado:", e);
            tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    processarDados: function(rawData, t, currentMonth, currentYear) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 

        if (t === 'dia') { 
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            for(let d=1; d<=lastDay; d++) {
                cols.push(String(d).padStart(2,'0'));
                datesMap[d] = { 
                    ini: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
                    fim: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                };
            }
        } else if (t === 'mes') { 
            const semanas = this.getSemanasDoMes(currentYear, currentMonth);
            semanas.forEach((s, i) => {
                cols.push(`Sem ${i+1}`);
                datesMap[i+1] = { ini: s.inicio, fim: s.fim };
            });
        } else if (t === 'trimestre') {
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(currentMonth / 3);
            const idxStart = (trim - 1) * 3;
            cols = [mesesNomes[idxStart], mesesNomes[idxStart+1], mesesNomes[idxStart+2]];
            for(let i=0; i<3; i++) {
                const m = idxStart + i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        } else if (t === 'semestre') {
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (currentMonth <= 6 ? 1 : 2);
            const idxStart = (sem - 1) * 6;
            cols = mesesNomes.slice(idxStart, idxStart + 6);
            for(let i=0; i<6; i++) {
                const m = idxStart + i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        } else { 
            cols = mesesNomes; 
            for(let i=0; i<12; i++) {
                const m = i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        }

        const numCols = cols.length;
        let st = {}; 
        for(let i=1; i<=numCols; i++) st[i] = this.newStats(); 
        st[99] = this.newStats(); 

        if(rawData) {
            rawData.forEach(r => {
                const sys = Number(r.quantidade) || 0;
                let b = 0; 

                if (t === 'dia') { 
                    b = parseInt(r.data_referencia.split('-')[2]); 
                } else if (t === 'mes') { 
                    for(let k=1; k<=numCols; k++) {
                        if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) { b = k; break; }
                    }
                } else { 
                    const mData = parseInt(r.data_referencia.split('-')[1]);
                    for(let k=1; k<=numCols; k++) {
                        const mIni = parseInt(datesMap[k].ini.split('-')[1]);
                        if(mData === mIni) { b = k; break; }
                    }
                }

                if(b >= 1 && b <= numCols) {
                    const populate = (k) => {
                        const x = st[k];
                        x.users.add(r.usuario_id); 
                        x.dates.add(r.data_referencia);
                        x.qty += sys; 
                        x.fifo += (Number(r.fifo)||0); 
                        x.gt += (Number(r.gradual_total)||0); 
                        x.gp += (Number(r.gradual_parcial)||0); 
                        x.fc += (Number(r.perfil_fc)||0);
                    };
                    populate(b);
                    populate(99);
                }
            });
        }

        for(let i=1; i<=numCols; i++) {
            if(datesMap[i]) {
                st[i].diasUteisTotal = this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim);
                st[i].diasUteisDecorridos = this.calcularDiasUteisDecorridos(datesMap[i].ini, datesMap[i].fim);
            }
        }
        
        st[99].diasUteisTotal = 0;
        st[99].diasUteisDecorridos = 0;
        for(let i=1; i<=numCols; i++) {
            st[99].diasUteisTotal += st[i].diasUteisTotal;
            st[99].diasUteisDecorridos += st[i].diasUteisDecorridos;
        }

        return { cols, st, numCols, datesMap };
    },

    processarEExibir: function(rawData, t, mes, ano) {
        try {
            this.dadosCalculados = this.processarDados(rawData, t, mes, ano);
            this.renderizar(this.dadosCalculados);
        } catch(e) {
            console.error("Erro processamento:", e);
        }
    },

    getHC: function(idx, st) {
        if (this.basesManuaisHC[idx] !== undefined) {
            return this.basesManuaisHC[idx];
        }
        return (st[idx] && st[idx].users.size > 0) ? st[idx].users.size : 1;
    },

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        
        if(!tbody || !hRow) return;

        // --- CÁLCULO DA MÉDIA DE HC PARA O TOTAL ---
        let somaHC = 0;
        let countHC = 0;
        for(let i=1; i<=numCols; i++) {
            // Só entra na média do total se o período existir/ocorreu
            if(st[i].diasUteisDecorridos > 0 || st[i].users.size > 0) {
                somaHC += this.getHC(i, st);
                countHC++;
            }
        }
        if(countHC === 0) { 
            for(let i=1; i<=numCols; i++) {
                somaHC += this.getHC(i, st);
                countHC++;
            }
        }
        const mediaHCTotal = countHC > 0 ? (somaHC / countHC) : 0;
        
        // --- HEADER ---
        let headerHTML = `
            <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]">
                    <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span>
                </th>`;
        
        cols.forEach((c, index) => {
            const idx = index + 1;
            const realUsers = st[idx] && st[idx].users ? st[idx].users.size : 0;
            const currentHC = this.basesManuaisHC[idx] !== undefined ? this.basesManuaisHC[idx] : (realUsers || 1);
            
            headerHTML += `
                <th class="px-2 py-2 text-center border-l border-slate-200 min-w-[100px] align-top">
                    <div class="flex flex-col items-center">
                        <span class="text-xs font-bold text-slate-600 uppercase mb-1">${c}</span>
                        <div class="flex items-center gap-1 text-[9px] text-slate-400 font-normal">
                            <i class="fas fa-edit"></i>
                            <span>HC Ajustado</span>
                        </div>
                        <input type="number" 
                               value="${currentHC}" 
                               onchange="Produtividade.Consolidado.mudarBasePeriodo(${idx}, this.value)"
                               class="header-input transition focus:shadow-sm" 
                               step="0.1">
                    </div>
                </th>`;
        });
        
        headerHTML += `
            <th class="px-6 py-4 text-center bg-blue-50 border-l border-blue-100 min-w-[120px] align-middle">
                <div class="flex flex-col items-center">
                    <span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span>
                    <span class="text-[9px] text-blue-400 font-medium mt-1">HC Médio: ${mediaHCTotal.toFixed(1)}</span>
                </div>
            </th></tr>`;

        hRow.innerHTML = headerHTML;

        // --- LINHAS ---
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);

        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            const rowBg = isBold ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors';
            const iconColor = colorInfo || 'text-slate-400';
            const textColor = isBold ? 'text-slate-800' : 'text-slate-600';
            
            let tr = `<tr class="${rowBg} border-b border-slate-100 last:border-0 group">
                <td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:bg-slate-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                            <i class="${icon} ${iconColor} text-sm"></i>
                        </div>
                        <span class="${textColor} ${isBold ? 'font-black' : 'font-medium'} text-xs uppercase tracking-wide">${label}</span>
                    </div>
                </td>`;
            
            idxs.forEach(i => {
                const s = st[i];
                if (!s) { tr += `<td class="px-4 py-3">-</td>`; return; }

                // Define HC e Dias para a célula atual
                let HF, Dias;
                
                if (i === 99) {
                    HF = mediaHCTotal;           // Para o Total, usa a Média de HC
                    Dias = s.diasUteisDecorridos;// Para o Total, usa a Soma dos Dias Decorridos
                } else {
                    HF = this.getHC(i, st);      // Para a coluna, usa o HC da coluna
                    Dias = s.diasUteisDecorridos;// Para a coluna, usa os dias decorridos da coluna
                }
                if (HF <= 0) HF = 1;

                // Executa a fórmula
                let val = isCalc ? getter(s, Dias, HF) : getter(s);
                if (val instanceof Set) val = val.size;
                
                const txt = (val !== undefined && val !== null && !isNaN(val)) ? 
                    (val % 1 !== 0 ? val.toFixed(1).replace('.',',') : Math.round(val).toLocaleString('pt-BR')) 
                    : '-';
                
                let cellClass = `px-4 py-3 text-center text-xs border-l border-slate-100 `;
                if (i === 99) cellClass += `bg-blue-50/30 font-bold ${colorInfo ? colorInfo : 'text-slate-700'}`;
                else cellClass += `text-slate-500 font-medium`;

                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };

        // --- DADOS ---
        
        // 1. Total Assistentes (Sistema)
        h += mkRow('Total Assistentes (Sistema)', 'fas fa-users', 'text-indigo-400', (s) => s.users.size, false, true);
        
        // 2. Dias
        h += mkRow('Dias Úteis (Calendário)', 'fas fa-calendar', 'text-slate-300', (s) => s.diasUteisTotal);
        h += mkRow('Dias Trabalhados (Decorridos)', 'fas fa-calendar-check', 'text-cyan-500', (s, d) => d, true); // Usa d

        // 3. Métricas de Volume
        h += mkRow('Total FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        // 4. Métricas de Média (Fórmulas Corrigidas)

        // Fórmula 1: Total de documentos validados / Total de Assistentes
        // Obs: "Total de Assistentes" aqui é o HC da coluna (ou média HC no Total)
        h += mkRow('Média Validação (Todas Assistentes)', 'fas fa-user-friends', 'text-teal-600', 
            (s, d, HF) => (HF > 0) ? s.qty / HF : 0, true);
            
        // Fórmula 2: Total de documentos validados / Total de dias Uteis / Total de Assistentes
        // Obs: Dias Úteis aqui são os Decorridos/Trabalhados (d)
        h += mkRow('Média Validação Diária (Por Assist.)', 'fas fa-user-tag', 'text-amber-600', 
            (s, d, HF) => (d > 0 && HF > 0) ? (s.qty / d) / HF : 0, true);
        
        tbody.innerHTML = h;
    },

    newStats: function() { 
        return { 
            users: new Set(), dates: new Set(), 
            diasUteisTotal: 0, diasUteisDecorridos: 0,
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0
        }; 
    },

    exportarExcel: function() {
        if (!this.dadosCalculados) return alert("Nenhum dado para exportar.");
        
        const { cols, st, numCols } = this.dadosCalculados;
        const wsData = [];
        
        // Calcula Média HC para Excel
        let somaHC = 0, countHC = 0;
        for(let i=1; i<=numCols; i++) {
            if(st[i].diasUteisDecorridos > 0 || st[i].users.size > 0) {
                somaHC += this.getHC(i, st);
                countHC++;
            }
        }
        const mediaHCTotal = countHC > 0 ? (somaHC / countHC) : 0;

        const headers = ['Indicador', ...cols, 'TOTAL'];
        wsData.push(headers);
        
        const rowHC = ['HC Ajustado (Manual)'];
        for(let i=1; i<=numCols; i++) {
             const manual = this.basesManuaisHC[i];
             const sist = st[i].users.size;
             rowHC.push(manual !== undefined ? manual : sist);
        }
        rowHC.push(`Méd: ${mediaHCTotal.toFixed(1)}`);
        wsData.push(rowHC);

        const addRow = (label, getter, isCalc=false) => {
            const row = [label];
            for(let i=1; i<=numCols; i++) {
                const s = st[i];
                if(!s) { row.push(0); continue; }
                
                let HF = this.getHC(i, st);
                let Dias = s.diasUteisDecorridos;
                
                let val = isCalc ? getter(s, Dias, HF) : getter(s);
                if (val instanceof Set) val = val.size;
                row.push((val !== undefined && !isNaN(val)) ? parseFloat(val.toFixed(2)) : 0);
            }
            
            // Coluna Total Excel
            const sTotal = st[99];
            if(sTotal) {
                let HF = mediaHCTotal;            // Média no Total
                let Dias = sTotal.diasUteisDecorridos; // Soma Dias no Total
                
                let valTotal = isCalc ? getter(sTotal, Dias, HF) : getter(sTotal);
                if (valTotal instanceof Set) valTotal = valTotal.size;
                row.push((valTotal !== undefined && !isNaN(valTotal)) ? parseFloat(valTotal.toFixed(2)) : 0);
            } else { row.push(0); }
            
            wsData.push(row);
        };

        addRow('Total Assistentes (Sistema)', (s) => s.users.size);
        addRow('Dias Úteis (Calendário)', (s) => s.diasUteisTotal);
        addRow('Dias Trabalhados (Decorridos)', (s, d) => d, true);
        addRow('Total FIFO', s => s.fifo);
        addRow('Total G. Parcial', s => s.gp);
        addRow('Total G. Total', s => s.gt);
        addRow('Total Perfil FC', s => s.fc);
        addRow('Total Documentos Validados', s => s.qty);
        
        // Fórmulas Excel
        addRow('Média Validação (Todas Assistentes)', (s, d, HF) => (HF > 0) ? s.qty / HF : 0, true);
        addRow('Média Validação Diária (Por Assist.)', (s, d, HF) => (d > 0 && HF > 0) ? (s.qty / d) / HF : 0, true);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
        XLSX.writeFile(wb, "Relatorio_Consolidado.xlsx");
    }
};