Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    basesManuaisHC: {}, // Armazena o HC por coluna: { 1: 5, 2: 6 ... }
    dadosCalculados: null, 

    // --- FUNÇÕES UTILITÁRIAS INTERNAS (Para não depender de outros arquivos) ---
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

    // --- LÓGICA DO MÓDULO ---
    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        // Garante que os selects estejam corretos ao iniciar
        setTimeout(() => this.togglePeriodo(), 100);
    },

    mudarBasePeriodo: function(colIndex, novoValor) {
        if(!novoValor || novoValor < 0) return;
        this.basesManuaisHC[colIndex] = parseInt(novoValor);
        
        // Recalcula apenas a renderização visual se já tiver dados
        if(this.dadosCalculados) {
            this.renderizar(this.dadosCalculados);
        }
    },

    togglePeriodo: function() {
        const typeEl = document.getElementById('cons-period-type');
        if(!typeEl) return; // Proteção caso o HTML não esteja pronto

        const t = typeEl.value;
        const selQ = document.getElementById('cons-select-quarter');
        const selS = document.getElementById('cons-select-semester');
        const dateInput = document.getElementById('global-date');
        
        // Reseta as bases manuais ao mudar o tipo de visualização para evitar confusão
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
        
        // Define intervalo de datas baseado na seleção
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
            if (!Produtividade.supabase) throw new Error("Conexão com banco não inicializada.");

            // Busca apenas os dados necessários, sem JOINS pesados que não são usados aqui
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
            tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro ao carregar: ${e.message}</td></tr>`;
        }
    },

    processarDados: function(rawData, t, currentMonth, currentYear) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 

        // Configura as colunas (Buckets)
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
            // Usa função interna segura
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
        } else { // Ano
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
        // Inicializa estrutura de estatísticas
        let st = {}; 
        for(let i=1; i<=numCols; i++) st[i] = this.newStats(); 
        st[99] = this.newStats(); // 99 é o ID da coluna Total

        // Popula dados
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

        // Calcula Dias Úteis
        for(let i=1; i<=numCols; i++) {
            st[i].diasUteis = datesMap[i] ? this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim) : 0;
        }
        st[99].diasUteis = 0;
        for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;

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

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        
        if(!tbody || !hRow) return;

        // --- RENDERIZA CABEÇALHO COM INPUTS DE HC ---
        let headerHTML = `
            <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]">
                    <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span>
                </th>`;
        
        cols.forEach((c, index) => {
            const idx = index + 1;
            // Se não houver HC manual, usa o count real de users do período, ou 1 para evitar divisão por zero
            const realUsers = st[idx] && st[idx].users ? st[idx].users.size : 0;
            const currentHC = this.basesManuaisHC[idx] !== undefined ? this.basesManuaisHC[idx] : (realUsers || 1);
            
            headerHTML += `
                <th class="px-2 py-2 text-center border-l border-slate-200 min-w-[100px] align-top">
                    <div class="flex flex-col items-center">
                        <span class="text-xs font-bold text-slate-600 uppercase mb-1">${c}</span>
                        <div class="flex items-center gap-1 text-[9px] text-slate-400 font-normal">
                            <i class="fas fa-users"></i>
                            <span>HC</span>
                        </div>
                        <input type="number" 
                               value="${currentHC}" 
                               onchange="Produtividade.Consolidado.mudarBasePeriodo(${idx}, this.value)"
                               class="header-input transition focus:shadow-sm" 
                               title="Ajustar Base de Assistentes para ${c}">
                    </div>
                </th>`;
        });
        
        // Coluna Total
        headerHTML += `
            <th class="px-6 py-4 text-center bg-blue-50 border-l border-blue-100 min-w-[120px] align-middle">
                <span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span>
            </th></tr>`;

        hRow.innerHTML = headerHTML;

        // --- RENDERIZA LINHAS ---
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

                // Lógica de HC: Prioriza manual, senão automático
                let HF;
                if(i === 99) {
                     HF = s.users.size || 1; // Para o total, usamos o total de usuários únicos do período
                } else {
                     HF = (this.basesManuaisHC[i] !== undefined) ? this.basesManuaisHC[i] : (s.users.size || 1);
                }

                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                if (val instanceof Set) val = val.size;
                
                const txt = (val !== undefined && val !== null && !isNaN(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                
                let cellClass = `px-4 py-3 text-center text-xs border-l border-slate-100 `;
                if (i === 99) cellClass += `bg-blue-50/30 font-bold ${colorInfo ? colorInfo : 'text-slate-700'}`;
                else cellClass += `text-slate-500 font-medium`;

                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };

        h += mkRow('Dias Úteis', 'fas fa-calendar-day', 'text-cyan-500', (s) => s.diasUteis);
        h += mkRow('Total FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        h += mkRow('Total Validação Diária', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        h += mkRow('Média Validação (Todas Assistentes)', 'fas fa-user-friends', 'text-teal-600', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true);
        h += mkRow('Média Validação Diária (Por Assist.)', 'fas fa-user-tag', 'text-amber-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);
        
        tbody.innerHTML = h;
    },

    newStats: function() { 
        return { 
            users: new Set(), dates: new Set(), diasUteis: 0,
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0
        }; 
    },

    exportarExcel: function() {
        if (!this.dadosCalculados) return alert("Nenhum dado para exportar.");
        
        const { cols, st, numCols } = this.dadosCalculados;
        const wsData = [];
        
        const headers = ['Indicador', ...cols, 'TOTAL'];
        wsData.push(headers);
        
        const rowHC = ['HC Considerado'];
        for(let i=1; i<=numCols; i++) {
             rowHC.push(this.basesManuaisHC[i] !== undefined ? this.basesManuaisHC[i] : (st[i] ? (st[i].users.size || 1) : 1));
        }
        rowHC.push(st[99] ? (st[99].users.size || 1) : 1);
        wsData.push(rowHC);

        const addRow = (label, getter, isCalc=false) => {
            const row = [label];
            for(let i=1; i<=numCols; i++) {
                const s = st[i];
                if(!s) { row.push(0); continue; }
                const HF = (this.basesManuaisHC[i] !== undefined) ? this.basesManuaisHC[i] : (s.users.size || 1);
                
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                if (val instanceof Set) val = val.size;
                row.push((val !== undefined && !isNaN(val)) ? Math.round(val) : 0);
            }
            const sTotal = st[99];
            if(sTotal) {
                const HFTotal = sTotal.users.size || 1;
                let valTotal = isCalc ? getter(sTotal, sTotal.diasUteis, HFTotal) : getter(sTotal);
                if (valTotal instanceof Set) valTotal = valTotal.size;
                row.push((valTotal !== undefined && !isNaN(valTotal)) ? Math.round(valTotal) : 0);
            } else {
                row.push(0);
            }
            wsData.push(row);
        };

        addRow('Dias Úteis', (s) => s.diasUteis);
        addRow('Total FIFO', s => s.fifo);
        addRow('Total G. Parcial', s => s.gp);
        addRow('Total G. Total', s => s.gt);
        addRow('Total Perfil FC', s => s.fc);
        addRow('Total Documentos Validados', s => s.qty);
        addRow('Total Validação Diária', (s, d) => d > 0 ? s.qty / d : 0, true);
        addRow('Média Validação (Todas Assistentes)', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true);
        addRow('Média Validação Diária (Por Assist.)', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
        XLSX.writeFile(wb, "Relatorio_Consolidado.xlsx");
    }
};