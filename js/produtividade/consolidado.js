/**
 * MÓDULO: Produtividade.Consolidado
 * FUNÇÃO: Visão gerencial agrupada por período com suporte a filtros dinâmicos
 * VERSÃO: 2.1 - Integração Total com Filtros de Semestre e Trimestre
 */
Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    baseManualHC: 0, 
    overridesHC: {}, 
    dadosCalculados: null, 
    monthToColMap: null, // Mapa para alinhar o mês real à coluna visual ativa

    init: async function() { 
        console.log("🔧 Consolidado: Iniciando módulo...");
        if(!this.initialized) { this.initialized = true; } 
        this.carregar();
    },

    /**
     * Calcula as janelas de datas para as semanas dentro de um mês específico
     */
    getSemanasDoMes: function(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        let currentDay = firstDay;
        
        while (currentDay <= lastDay) {
            const startOfWeek = new Date(currentDay);
            const dayOfWeek = currentDay.getDay(); 
            const daysToSaturday = 6 - dayOfWeek;
            let endOfWeek = new Date(currentDay);
            endOfWeek.setDate(currentDay.getDate() + daysToSaturday);
            
            if (endOfWeek > lastDay) endOfWeek = lastDay;
            
            weeks.push({
                inicio: startOfWeek.toISOString().split('T')[0],
                fim: endOfWeek.toISOString().split('T')[0]
            });
            
            currentDay = new Date(endOfWeek);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        return weeks;
    },

    /**
     * Atualiza manualmente o Headcount (HC) de uma coluna com exigência de justificativa
     */
    atualizarHC: async function(colIndex, novoValor) {
        const val = parseInt(novoValor);
        if (isNaN(val) || val <= 0) { 
            delete this.overridesHC[colIndex]; 
            this.renderizar(this.dadosCalculados); 
            return; 
        }
        
        const valorAtual = this.overridesHC[colIndex]?.valor;
        if (valorAtual === val) return;
        
        await new Promise(resolve => setTimeout(resolve, 50));
        const motivo = prompt(`Motivo da alteração para ${val} (Obrigatório):`);
        
        if (!motivo || motivo.trim() === "") { 
            alert("Justificativa obrigatória para prosseguir com a alteração."); 
            this.renderizar(this.dadosCalculados); 
            return; 
        }
        
        this.overridesHC[colIndex] = { valor: val, motivo: motivo.trim() };
        if (this.dadosCalculados) this.renderizar(this.dadosCalculados);
    },
    
    /**
     * Calcula dias úteis excluindo fins de semana e feriados cadastrados no sistema
     */
    calcularDiasUteisCalendario: function(dataInicio, dataFim) {
        const feriados = Produtividade.Geral && Produtividade.Geral.feriados ? Produtividade.Geral.feriados : [];
        let count = 0; 
        let cur = new Date(dataInicio + 'T12:00:00'); 
        const end = new Date(dataFim + 'T12:00:00');
        
        while (cur <= end) { 
            const day = cur.getDay(); 
            if (day !== 0 && day !== 6) { // Exclui Domingo (0) e Sábado (6)
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
    
    /**
     * Recupera dados do Supabase baseando-se no filtro global de datas
     */
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio;
        const e = datas.fim;
        let t = Produtividade.filtroPeriodo || 'mes'; 

        if (t === 'semana') t = 'dia'; // Tratamento para visualização detalhada

        console.log(`📊 Consolidado: Modo ${t} | Range: ${s} até ${e}`);

        const cacheKey = `${t}_${s}_${e}`;
        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) { 
            this.processarEExibir(this.ultimoCache.data, t, s, e); 
            return; 
        }
        
        this.overridesHC = {}; // Limpa ajustes manuais ao trocar o contexto temporal
        
        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Processando dados consolidados...</td></tr>';

        try {
            const { data: rawData, error } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e)
                .range(0, 50000); 

            if(error) throw error;
            
            const usuariosUnicos = new Set(rawData.map(r => r.usuario_id)).size;
            if (this.baseManualHC === 0) this.baseManualHC = usuariosUnicos || 17;
            
            this.ultimoCache = { key: cacheKey, data: rawData, tipo: t };
            this.processarEExibir(rawData, t, s, e);

        } catch (error) { 
            console.error("Erro ao carregar consolidado:", error); 
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro de carregamento: ${error.message}</td></tr>`; 
        }
    },

    /**
     * Organiza os dados brutos em colunas dinâmicas (Dias, Semanas ou Meses)
     */
    processarDados: function(rawData, t, dataInicio, dataFim) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 
        this.monthToColMap = {};

        const dIni = new Date(dataInicio + 'T12:00:00');
        const currentYear = dIni.getFullYear();
        const currentMonth = dIni.getMonth() + 1;

        if (t === 'dia') { 
            let curr = new Date(dataInicio + 'T12:00:00');
            const end = new Date(dataFim + 'T12:00:00');
            let idx = 1;
            while(curr <= end) {
                const diaStr = String(curr.getDate()).padStart(2,'0');
                cols.push(diaStr);
                const dataFull = curr.toISOString().split('T')[0];
                datesMap[idx] = { ini: dataFull, fim: dataFull, refDia: parseInt(diaStr) }; 
                curr.setDate(curr.getDate() + 1);
                idx++;
            }
        } 
        else if (t === 'mes') { 
            const semanas = this.getSemanasDoMes(currentYear, currentMonth); 
            semanas.forEach((s, i) => { 
                cols.push(`Semana ${i+1}`); 
                datesMap[i+1] = { ini: s.inicio, fim: s.fim }; 
            }); 
        } 
        else if (t === 'ano') { 
            const dFimObj = new Date(dataFim + 'T12:00:00');
            const startMonthIdx = dIni.getMonth(); 
            const endMonthIdx = dFimObj.getMonth(); 
            
            for(let i = startMonthIdx; i <= endMonthIdx; i++) { 
                cols.push(mesesNomes[i]);
                const realMonth = i + 1;
                const displayIndex = cols.length; 
                this.monthToColMap[realMonth] = displayIndex;
                
                datesMap[displayIndex] = { 
                    ini: `${currentYear}-${String(realMonth).padStart(2,'0')}-01`, 
                    fim: `${currentYear}-${String(realMonth).padStart(2,'0')}-${new Date(currentYear, realMonth, 0).getDate()}` 
                }; 
            } 
        }

        const numCols = cols.length;
        let st = {}; 
        for(let i=1; i<=numCols; i++) st[i] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
        st[99] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 

        if(rawData) {
            rawData.forEach(r => {
                const sys = Number(r.quantidade) || 0; 
                let b = -1; 

                if (t === 'dia') { 
                    for(let k=1; k<=numCols; k++) {
                        if (datesMap[k].ini === r.data_referencia) { b = k; break; }
                    }
                } 
                else if (t === 'mes') { 
                    for(let k=1; k<=numCols; k++) { 
                        if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) { b = k; break; } 
                    } 
                } 
                else if (t === 'ano') { 
                    const mesData = parseInt(r.data_referencia.split('-')[1]); 
                    if (this.monthToColMap[mesData] !== undefined) b = this.monthToColMap[mesData];
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
            st[i].diasUteis = datesMap[i] ? this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim) : 0;
        }
        
        st[99].diasUteis = 0; 
        for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;
        
        return { cols, st, numCols, datesMap };
    },

    processarEExibir: function(rawData, t, s, e) {
        this.dadosCalculados = this.processarDados(rawData, t, s, e);
        this.renderizar(this.dadosCalculados);
    },

    /**
     * Renderiza fisicamente a tabela HTML baseando-se nos indicadores calculados
     */
    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        
        if(hRow) {
            let headerHTML = `<tr class="bg-slate-50 border-b border-slate-200"><th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>`;
            
            cols.forEach((c, index) => {
                const colIdx = index + 1;
                const overrideObj = this.overridesHC[colIdx];
                const valOverride = overrideObj ? overrideObj.valor : '';
                const autoCount = st[colIdx].users.size || 17;
                
                headerHTML += `
                    <th class="px-2 py-2 text-center border-l border-slate-200 min-w-[80px]">
                        <div class="flex flex-col items-center gap-1">
                            <span class="text-xs font-bold text-slate-600 uppercase">${c}</span>
                            <input type="number" value="${valOverride}" placeholder="(${autoCount})" onchange="Produtividade.Consolidado.atualizarHC(${colIdx}, this.value)" class="w-full text-[10px] text-center rounded py-0.5 outline-none border transition">
                        </div>
                    </th>`;
            });
            
            const autoTotal = st[99].users.size || 17; 
            headerHTML += `<th class="px-4 py-2 text-center bg-blue-50 border-l border-blue-100 min-w-[100px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-black text-blue-600 uppercase">TOTAL</span><input type="number" placeholder="(${autoTotal})" onchange="Produtividade.Consolidado.atualizarHC(99, this.value)" class="w-full max-w-[60px] text-[10px] text-center rounded py-0.5 outline-none border transition"></div></th></tr>`;
            hRow.innerHTML = headerHTML;
        }

        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); 
        idxs.push(99); 

        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            let tr = `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100"><td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"><div class="flex items-center gap-3"><i class="${icon} ${colorInfo} text-sm"></i><span class="text-xs uppercase ${isBold ? 'font-black' : 'font-medium'}">${label}</span></div></td>`;
            
            idxs.forEach(i => {
                const s = st[i]; 
                const overrideObj = this.overridesHC[i]; 
                const HF = overrideObj ? overrideObj.valor : (s.users.size || 17);
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s); 
                const txt = (val !== undefined && !isNaN(val) && isFinite(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                tr += `<td class="px-4 py-3 text-center text-xs ${i === 99 ? 'bg-blue-50/30 font-bold' : ''}">${txt}</td>`;
            });
            return tr + '</tr>';
        };

        // Injeção de Linhas de Indicadores
        h += mkRow('Total Assistentes', 'fas fa-users-cog', 'text-indigo-400', (s, d, HF) => HF, true);
        h += mkRow('Dias Úteis', 'fas fa-calendar-day', 'text-cyan-500', (s) => s.diasUteis);
        h += mkRow('Total FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total Doc. Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        h += mkRow('Total Val. Diária', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        h += mkRow('Média Val. (Equipe)', 'fas fa-user-friends', 'text-teal-600', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true);
        h += mkRow('Média Val. Diária (Pessoa)', 'fas fa-user-tag', 'text-amber-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);
        
        if(tbody) tbody.innerHTML = h;
    },

    /**
     * Gera relatório em Excel baseado na visualização consolidada atual
     */
    exportarExcel: function() {
        if (!this.dadosCalculados) return alert("Nenhum dado para exportar.");
        const { cols, st, numCols } = this.dadosCalculados;
        const wsData = [['Indicador', ...cols, 'TOTAL']];
        
        const addRow = (label, getter, isCalc=false) => {
            const row = [label];
            for(let i=1; i<=numCols; i++) {
                const s = st[i]; const HF = this.overridesHC[i] ? this.overridesHC[i].valor : (s.users.size || 17);
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                row.push((val !== undefined && !isNaN(val)) ? Math.round(val) : 0);
            }
            const sT = st[99]; const HFT = this.overridesHC[99] ? this.overridesHC[99].valor : (sT.users.size || 17);
            let vT = isCalc ? getter(sT, sT.diasUteis, HFT) : getter(sT);
            row.push((vT !== undefined && !isNaN(vT)) ? Math.round(vT) : 0);
            wsData.push(row);
        };

        addRow('Total Assistentes', (s, d, HF) => HF, true); 
        addRow('Dias Úteis', (s) => s.diasUteis); 
        addRow('Total FIFO', s => s.fifo); 
        addRow('Total G. Parcial', s => s.gp); 
        addRow('Total G. Total', s => s.gt); 
        addRow('Total Perfil FC', s => s.fc); 
        addRow('Total Documentos Validados', s => s.qty); 
        addRow('Total Validação Diária', (s, d) => d > 0 ? s.qty / d : 0, true); 
        addRow('Média Validação (Equipe)', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true); 
        addRow('Média Validação Diária (Pessoa)', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);
        
        const wb = XLSX.utils.book_new(); 
        const ws = XLSX.utils.aoa_to_sheet(wsData); 
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado"); 
        XLSX.writeFile(wb, "Relatorio_Consolidado.xlsx");
    }
};