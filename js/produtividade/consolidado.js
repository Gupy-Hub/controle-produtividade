Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    baseManualHC: 0, 
    overridesHC: {}, 
    dadosCalculados: null, 

    init: async function() { 
        console.log("🔧 Consolidado: Iniciando...");
        if(!this.initialized) { this.initialized = true; } 
        this.carregar();
    },

    // Função auxiliar para calcular semanas do mês (Era o que faltava)
    getSemanasDoMes: function(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        let currentDay = firstDay;
        
        while (currentDay <= lastDay) {
            const startOfWeek = new Date(currentDay);
            // Define o fim da semana (Sábado ou fim do mês)
            const dayOfWeek = currentDay.getDay(); // 0 (Dom) a 6 (Sab)
            const daysToSaturday = 6 - dayOfWeek;
            let endOfWeek = new Date(currentDay);
            endOfWeek.setDate(currentDay.getDate() + daysToSaturday);
            
            if (endOfWeek > lastDay) endOfWeek = lastDay;
            
            weeks.push({
                inicio: startOfWeek.toISOString().split('T')[0],
                fim: endOfWeek.toISOString().split('T')[0]
            });
            
            // Avança para o próximo domingo
            currentDay = new Date(endOfWeek);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        return weeks;
    },

    // Detecta qual botão de período está ativo no HTML
    detectarPeriodoAtivo: function() {
        if (document.getElementById('btn-periodo-dia') && document.getElementById('btn-periodo-dia').classList.contains('bg-blue-600')) return 'dia'; // Grade Diária
        if (document.getElementById('btn-periodo-mes') && document.getElementById('btn-periodo-mes').classList.contains('text-blue-600')) return 'mes'; // Grade Semanal
        if (document.getElementById('btn-periodo-ano') && document.getElementById('btn-periodo-ano').classList.contains('text-blue-600')) return 'ano'; // Grade Mensal
        return 'dia'; // Default
    },

    atualizarHC: async function(colIndex, novoValor) {
        const val = parseInt(novoValor);
        if (isNaN(val) || val <= 0) { delete this.overridesHC[colIndex]; this.renderizar(this.dadosCalculados); return; }
        const valorAtual = this.overridesHC[colIndex]?.valor;
        if (valorAtual === val) return;
        await new Promise(r => setTimeout(r, 50));
        const motivo = prompt(`Motivo da alteração para ${val} (Obrigatório):`);
        if (!motivo || motivo.trim() === "") { alert("Justificativa obrigatória."); this.renderizar(this.dadosCalculados); return; }
        this.overridesHC[colIndex] = { valor: val, motivo: motivo.trim() };
        if (this.dadosCalculados) this.renderizar(this.dadosCalculados);
    },
    
    calcularDiasUteisCalendario: function(dataInicio, dataFim) {
        // Usa a lista de feriados do Geral se disponível
        const feriados = Produtividade.Geral && Produtividade.Geral.feriados ? Produtividade.Geral.feriados : [];
        
        let count = 0; 
        let cur = new Date(dataInicio + 'T12:00:00'); 
        const end = new Date(dataFim + 'T12:00:00');
        
        while (cur <= end) { 
            const day = cur.getDay(); 
            if (day !== 0 && day !== 6) {
                // Verifica Feriado
                const mes = String(cur.getMonth() + 1).padStart(2, '0');
                const dia = String(cur.getDate()).padStart(2, '0');
                if (!feriados.includes(`${mes}-${dia}`)) {
                    count++; 
                }
            }
            cur.setDate(cur.getDate() + 1); 
        }
        return count;
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        
        // 1. Captura Data e Tipo
        const t = this.detectarPeriodoAtivo();
        const selAno = document.getElementById('sel-ano');
        const selMes = document.getElementById('sel-mes');
        
        const ano = selAno ? parseInt(selAno.value) : new Date().getFullYear();
        const mes = selMes ? parseInt(selMes.value) + 1 : new Date().getMonth() + 1; // JS Mes 0-11
        
        const sAno = String(ano); 
        const sMes = String(mes).padStart(2, '0');
        
        let s, e;
        
        // Define o range de busca no banco
        if (t === 'dia' || t === 'mes') { 
            // Busca o mês inteiro para mostrar dias ou semanas
            s = `${sAno}-${sMes}-01`; 
            e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        } 
        else if (t === 'ano') { 
            s = `${sAno}-01-01`; 
            e = `${sAno}-12-31`; 
        } else {
            // Default Mês atual
            s = `${sAno}-${sMes}-01`; 
            e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        }

        console.log(`📊 Consolidado: ${t} | ${s} até ${e}`);

        const cacheKey = `${t}_${s}_${e}`;
        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) { 
            this.processarEExibir(this.ultimoCache.data, t, mes, ano); 
            return; 
        }
        
        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados massivos...</td></tr>';

        try {
            // BUSCA COM RANGE AUMENTADO (50k)
            const { data: rawData, error } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e)
                .range(0, 50000); // <--- CORREÇÃO CRÍTICA

            if(error) throw error;
            
            const usuariosUnicos = new Set(rawData.map(r => r.usuario_id)).size;
            if (this.baseManualHC === 0) this.baseManualHC = usuariosUnicos || 17;
            
            this.ultimoCache = { key: cacheKey, data: rawData, tipo: t, mes: mes, ano: ano };
            this.processarEExibir(rawData, t, mes, ano);

        } catch (e) { 
            console.error(e); 
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`; 
        }
    },

    processarDados: function(rawData, t, currentMonth, currentYear) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 

        // CONFIGURA AS COLUNAS (Buckets)
        if (t === 'dia' || t === 'dia-detalhe') { 
            // Modo Dia: Colunas são os dias do mês (01, 02, 03...)
            const lastDay = new Date(currentYear, currentMonth, 0).getDate(); 
            for(let d=1; d<=lastDay; d++) { 
                cols.push(String(d).padStart(2,'0')); 
                const dataFull = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                datesMap[d] = { ini: dataFull, fim: dataFull }; 
            } 
        } 
        else if (t === 'mes') { 
            // Modo Mês: Colunas são Semanas (Sem 1, Sem 2...)
            const semanas = this.getSemanasDoMes(currentYear, currentMonth); 
            semanas.forEach((s, i) => { 
                cols.push(`Sem ${i+1}`); 
                datesMap[i+1] = { ini: s.inicio, fim: s.fim }; 
            }); 
        } 
        else if (t === 'ano') { 
            // Modo Ano: Colunas são Meses (Jan, Fev...)
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
        for(let i=1; i<=numCols; i++) st[i] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
        st[99] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; // Totalizador

        if(rawData) {
            rawData.forEach(r => {
                const sys = Number(r.quantidade) || 0; 
                let b = -1; // Bucket Index

                // Descobre em qual coluna (bucket) o dado cai
                if (t === 'dia' || t === 'dia-detalhe') { 
                    b = parseInt(r.data_referencia.split('-')[2]); 
                } 
                else if (t === 'mes') { 
                    for(let k=1; k<=numCols; k++) { 
                        if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) { b = k; break; } 
                    } 
                } 
                else if (t === 'ano') { 
                    b = parseInt(r.data_referencia.split('-')[1]); 
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
                    populate(99); // Soma no Total Geral
                }
            });
        }

        // Calcula Dias Úteis de cada coluna
        for(let i=1; i<=numCols; i++) {
            st[i].diasUteis = datesMap[i] ? this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim) : 0;
        }
        
        // Totalizador de Dias Úteis (Soma ou Global?)
        // Se for ano, soma os meses. Se for dia, soma os dias uteis do mes.
        st[99].diasUteis = 0; 
        for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;
        
        return { cols, st, numCols, datesMap };
    },

    processarEExibir: function(rawData, t, mes, ano) {
        this.dadosCalculados = this.processarDados(rawData, t, mes, ano);
        this.renderizar(this.dadosCalculados);
    },

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        
        // RENDERIZA CABEÇALHO
        if(hRow) {
            let headerHTML = `<tr class="bg-slate-50 border-b border-slate-200"><th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>`;
            
            cols.forEach((c, index) => {
                const colIdx = index + 1;
                const overrideObj = this.overridesHC[colIdx];
                const valOverride = overrideObj ? overrideObj.valor : '';
                const motivoOverride = overrideObj ? overrideObj.motivo : '';
                const autoCount = st[colIdx].users.size || 17;
                const inputClass = valOverride ? "bg-amber-50 border-amber-300 text-amber-700 font-black shadow-sm" : "bg-white border-slate-200 text-blue-600 font-bold focus:border-blue-400";
                
                headerHTML += `
                    <th class="px-2 py-2 text-center border-l border-slate-200 min-w-[80px] group">
                        <div class="flex flex-col items-center gap-1">
                            <span class="text-xs font-bold text-slate-600 uppercase">${c}</span>
                            <div class="relative w-full max-w-[50px]" title="${valOverride ? 'Motivo: ' + motivoOverride : 'HC Automático: ' + autoCount}">
                                <input type="number" value="${valOverride}" placeholder="(${autoCount})" onchange="Produtividade.Consolidado.atualizarHC(${colIdx}, this.value)" class="w-full text-[10px] text-center rounded py-0.5 outline-none border transition placeholder-slate-300 ${inputClass}">
                            </div>
                        </div>
                    </th>`;
            });
            
            // Coluna Total
            const overrideTotal = this.overridesHC[99];
            const valTotal = overrideTotal ? overrideTotal.valor : '';
            const autoTotal = st[99].users.size || 17; // Pega do total
            const inputClassTotal = valTotal ? "bg-amber-50 border-amber-300 text-amber-700 font-black shadow-sm" : "bg-white border-blue-200 text-blue-700 font-bold focus:border-blue-500";
            
            headerHTML += `<th class="px-4 py-2 text-center bg-blue-50 border-l border-blue-100 min-w-[100px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span><input type="number" value="${valTotal}" placeholder="(${autoTotal})" onchange="Produtividade.Consolidado.atualizarHC(99, this.value)" class="w-full max-w-[60px] text-[10px] text-center rounded py-0.5 outline-none border transition placeholder-blue-300 ${inputClassTotal}"></div></th></tr>`;
            
            hRow.innerHTML = headerHTML;
        }

        // RENDERIZA LINHAS
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); 
        idxs.push(99); // Inclui Total

        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            const rowBg = isBold ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors';
            const iconColor = colorInfo || 'text-slate-400';
            const textColor = isBold ? 'text-slate-800' : 'text-slate-600';
            
            let tr = `<tr class="${rowBg} border-b border-slate-100 last:border-0 group"><td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:bg-slate-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100"><i class="${icon} ${iconColor} text-sm"></i></div><span class="${textColor} ${isBold ? 'font-black' : 'font-medium'} text-xs uppercase tracking-wide">${label}</span></div></td>`;
            
            idxs.forEach(i => {
                const s = st[i]; 
                const overrideObj = this.overridesHC[i]; 
                
                // HC Logic: Se tem override manual, usa ele. Se não, usa count de users unicos. Se 0, usa 17.
                const countAuto = s.users.size > 0 ? s.users.size : 17; 
                const HF = overrideObj ? overrideObj.valor : countAuto;
                
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s); 
                if (val instanceof Set) val = val.size;
                
                const txt = (val !== undefined && val !== null && !isNaN(val) && isFinite(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                
                let cellClass = `px-4 py-3 text-center text-xs border-l border-slate-100 `; 
                if (i === 99) cellClass += `bg-blue-50/30 font-bold ${colorInfo ? colorInfo : 'text-slate-700'}`; 
                else cellClass += `text-slate-500 font-medium`; 
                
                if (overrideObj && label === 'HC Utilizado') cellClass += " bg-amber-50/50 font-bold text-amber-700";

                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };

        h += mkRow('HC Utilizado', 'fas fa-users-cog', 'text-indigo-400', (s, d, HF) => HF, true);
        h += mkRow('Dias Úteis', 'fas fa-calendar-day', 'text-cyan-500', (s) => s.diasUteis);
        h += mkRow('Total FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total Doc. Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        // Cálculos de Média
        h += mkRow('Total Val. Diária', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        h += mkRow('Média Val. (Equipe)', 'fas fa-user-friends', 'text-teal-600', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true);
        h += mkRow('Média Val. Diária (Pessoa)', 'fas fa-user-tag', 'text-amber-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);
        
        if(tbody) tbody.innerHTML = h;
    },

    exportarExcel: function() {
        if (!this.dadosCalculados) return alert("Nenhum dado para exportar.");
        const { cols, st, numCols } = this.dadosCalculados;
        const wsData = [];
        
        // Header
        const headers = ['Indicador', ...cols, 'TOTAL'];
        wsData.push(headers);
        
        const addRow = (label, getter, isCalc=false) => {
            const row = [label];
            for(let i=1; i<=numCols; i++) {
                const s = st[i]; const overrideObj = this.overridesHC[i]; const HF = overrideObj ? overrideObj.valor : (s.users.size || 17);
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s); if (val instanceof Set) val = val.size;
                row.push((val !== undefined && !isNaN(val)) ? Math.round(val) : 0);
            }
            // Total
            const sTotal = st[99]; const overrideTotal = this.overridesHC[99]; const HFTotal = overrideTotal ? overrideTotal.valor : (sTotal.users.size || 17);
            let valTotal = isCalc ? getter(sTotal, sTotal.diasUteis, HFTotal) : getter(sTotal); if (valTotal instanceof Set) valTotal = valTotal.size;
            row.push((valTotal !== undefined && !isNaN(valTotal)) ? Math.round(valTotal) : 0);
            wsData.push(row);
        };

        addRow('HC Utilizado', (s, d, HF) => HF, true); 
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