/**
 * MÓDULO: Produtividade.Consolidado
 * FUNÇÃO: Visão gerencial agrupada por período
 */
Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    baseManualHC: 0, 
    overridesHC: {}, 
    dadosCalculados: null, 
    monthToColMap: null,
    
    // CONFIGURAÇÃO: Headcount Padrão definido pela regra de negócio
    PADRAO_HC: 17,

    init: async function() { 
        console.log("🔧 Consolidado: Iniciando V6 (Padrão HC 17 Fixo)...");
        if(!this.initialized) { this.initialized = true; } 
        this.carregar();
    },

    getStorageKey: function(t, s, e) {
        return `gupy_consolidado_hc_${t}_${s}_${e}`;
    },

    carregarEstado: function(t, s, e) {
        const key = this.getStorageKey(t, s, e);
        const salvo = localStorage.getItem(key);
        if (salvo) {
            try {
                this.overridesHC = JSON.parse(salvo);
            } catch(e) { console.error("Erro ao ler estado", e); }
        } else {
            this.overridesHC = {}; 
        }
    },

    salvarEstado: function() {
        const datas = Produtividade.getDatasFiltro();
        let t = Produtividade.filtroPeriodo || 'mes';
        if (t === 'semana') t = 'dia';
        
        const key = this.getStorageKey(t, datas.inicio, datas.fim);
        localStorage.setItem(key, JSON.stringify(this.overridesHC));
    },

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

    atualizarHC: async function(colIndex, novoValor) {
        const val = parseInt(novoValor);
        
        // 1. Se inválido, volta para o padrão (deleta override)
        if (isNaN(val) || val <= 0) { 
            delete this.overridesHC[colIndex]; 
            this.salvarEstado(); 
            this.renderizar(this.dadosCalculados); 
            return; 
        }

        // 2. SMART RESET: Se for igual ao PADRÃO (17), remove override
        // O sistema agora considera 17 como o "automático/original"
        if (val === this.PADRAO_HC) {
            delete this.overridesHC[colIndex];
            this.salvarEstado();
            this.renderizar(this.dadosCalculados);
            return;
        }

        // 3. Verifica se houve mudança real no valor manual
        const valorAtual = this.overridesHC[colIndex]?.valor;
        if (valorAtual === val) return;
        
        // 4. Pede justificativa para sair do padrão 17
        await new Promise(r => setTimeout(r, 50));
        
        const motivo = prompt(`O padrão é ${this.PADRAO_HC} assistentes. \nVocê está alterando para ${val}. \n\nQual o motivo? (Obrigatório):`);
        
        if (!motivo || motivo.trim() === "") { 
            alert("❌ Alteração cancelada: Justificativa obrigatória."); 
            this.renderizar(this.dadosCalculados); 
            return; 
        }
        
        this.overridesHC[colIndex] = { valor: val, motivo: motivo.trim() };
        this.salvarEstado();
        
        if (this.dadosCalculados) this.renderizar(this.dadosCalculados);
    },
    
    calcularDiasUteisCalendario: function(dataInicio, dataFim) {
        const feriados = Produtividade.Geral && Produtividade.Geral.feriados ? Produtividade.Geral.feriados : [];
        let count = 0; 
        let cur = new Date(dataInicio + 'T12:00:00'); 
        const end = new Date(dataFim + 'T12:00:00');
        while (cur <= end) { 
            const day = cur.getDay(); 
            if (day !== 0 && day !== 6) {
                const mes = String(cur.getMonth() + 1).padStart(2, '0');
                const dia = String(cur.getDate()).padStart(2, '0');
                if (!feriados.includes(`${mes}-${dia}`)) count++; 
            }
            cur.setDate(cur.getDate() + 1); 
        }
        return count;
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio;
        const e = datas.fim;
        let t = Produtividade.filtroPeriodo || 'mes'; 

        if (t === 'semana') t = 'dia';

        const cacheKey = `${t}_${s}_${e}`;
        this.carregarEstado(t, s, e);

        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) { 
            this.processarEExibir(this.ultimoCache.data, t, s, e); 
            return; 
        }
        
        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        try {
            const { data: rawData, error } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e); 

            if(error) throw error;
            
            this.ultimoCache = { key: cacheKey, data: rawData, tipo: t };
            this.processarEExibir(rawData, t, s, e);
        } catch (e) { 
            console.error(e); 
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`; 
        }
    },

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
                datesMap[idx] = { ini: curr.toISOString().split('T')[0], fim: curr.toISOString().split('T')[0] }; 
                curr.setDate(curr.getDate() + 1);
                idx++;
            }
        } else if (t === 'mes') { 
            const semanas = this.getSemanasDoMes(currentYear, currentMonth); 
            semanas.forEach((s, i) => { 
                cols.push(`Sem ${i+1}`); 
                datesMap[i+1] = { ini: s.inicio, fim: s.fim }; 
            }); 
        } else if (t === 'ano') { 
            const dFimObj = new Date(dataFim + 'T12:00:00');
            for(let i = dIni.getMonth(); i <= dFimObj.getMonth(); i++) { 
                cols.push(mesesNomes[i]);
                const displayIndex = cols.length;
                this.monthToColMap[i + 1] = displayIndex;
                datesMap[displayIndex] = { 
                    ini: `${currentYear}-${String(i+1).padStart(2,'0')}-01`, 
                    fim: `${currentYear}-${String(i+1).padStart(2,'0')}-${new Date(currentYear, i+1, 0).getDate()}` 
                }; 
            } 
        }

        const numCols = cols.length;
        let st = {}; 
        for(let i=1; i<=numCols; i++) st[i] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
        st[99] = { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 

        if(rawData) {
            rawData.forEach(r => {
                let b = -1;
                if (t === 'dia') { 
                    for(let k=1; k<=numCols; k++) if (datesMap[k].ini === r.data_referencia) b = k;
                } else if (t === 'mes') { 
                    for(let k=1; k<=numCols; k++) if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) b = k;
                } else if (t === 'ano') { 
                    const mesData = parseInt(r.data_referencia.split('-')[1]); 
                    if (this.monthToColMap[mesData]) b = this.monthToColMap[mesData];
                }

                if(b >= 1 && b <= numCols) {
                    [b, 99].forEach(k => {
                        st[k].users.add(r.usuario_id); 
                        st[k].qty += Number(r.quantidade) || 0; 
                        st[k].fifo += Number(r.fifo) || 0;
                        st[k].gt += Number(r.gradual_total) || 0;
                        st[k].gp += Number(r.gradual_parcial) || 0;
                        st[k].fc += Number(r.perfil_fc) || 0;
                    });
                }
            });
        }

        for(let i=1; i<=numCols; i++) st[i].diasUteis = this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim);
        for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;
        
        return { cols, st, numCols };
    },

    processarEExibir: function(rawData, t, s, e) {
        this.dadosCalculados = this.processarDados(rawData, t, s, e);
        this.renderizar(this.dadosCalculados);
    },

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        if(!tbody || !hRow) return;

        let headerHTML = `<tr class="bg-slate-50 border-b border-slate-200"><th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>`;
        
        // Loop das Colunas (Semana/Mes/Dia)
        cols.forEach((c, index) => {
            const colIdx = index + 1;
            // PADRÃO 17 SEMPRE
            const autoCount = this.PADRAO_HC; 
            headerHTML += `<th class="px-2 py-2 text-center border-l border-slate-200 min-w-[80px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-bold text-slate-600 uppercase">${c}</span><input type="number" value="${this.overridesHC[colIdx]?.valor || ''}" placeholder="(${autoCount})" onchange="Produtividade.Consolidado.atualizarHC(${colIdx}, this.value)" class="w-full text-[10px] text-center rounded py-0.5 border"></div></th>`;
        });
        
        // Coluna Total
        const totalAuto = this.PADRAO_HC;
        headerHTML += `<th class="px-4 py-2 text-center bg-blue-50 border-l border-blue-100 min-w-[100px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-black text-blue-600 uppercase">TOTAL</span><input type="number" value="${this.overridesHC[99]?.valor || ''}" placeholder="(${totalAuto})" onchange="Produtividade.Consolidado.atualizarHC(99, this.value)" class="w-full max-w-[60px] text-[10px] text-center rounded py-0.5 border"></div></th></tr>`;
        hRow.innerHTML = headerHTML;

        const mkRow = (label, icon, color, getter, isCalc=false, isBold=false) => {
            let tr = `<tr class="${isBold ? 'bg-slate-50/50' : ''} border-b border-slate-100"><td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200"><div class="flex items-center gap-3"><i class="${icon} ${color} text-sm"></i><span class="text-xs uppercase ${isBold ? 'font-black' : 'font-medium'}">${label}</span></div></td>`;
            
            [...Array(numCols).keys()].map(i => i + 1).concat(99).forEach(i => {
                const s = st[i];
                
                // --- LÓGICA DE OURO: PADRÃO 17 ---
                const autoCount = this.PADRAO_HC;
                const override = this.overridesHC[i];
                const HF = override ? override.valor : autoCount; // Usa 17 se não tiver override
                
                const val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                
                let cellHTML = (val !== undefined && !isNaN(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                
                if (label === 'Total de assistentes') {
                    if (override) {
                        const tooltip = `Padrão: ${autoCount} | Motivo: ${override.motivo}`;
                        cellHTML = `<span title="${tooltip}" class="cursor-help text-amber-600 font-bold decoration-dotted underline decoration-amber-400 bg-amber-50 px-1 rounded transition hover:bg-amber-100 hover:text-amber-800">${cellHTML}</span>`;
                    } else {
                        // Mostra o 17 limpo
                        cellHTML = `<span title="Padrão do Sistema" class="cursor-default text-slate-500">${cellHTML}</span>`;
                    }
                }
                
                tr += `<td class="px-4 py-3 text-center text-xs ${i === 99 ? 'bg-blue-50/30 font-bold' : ''}">${cellHTML}</td>`;
            });
            return tr + '</tr>';
        };

        let rows = mkRow('Total de assistentes', 'fas fa-users-cog', 'text-indigo-400', (s, d, HF) => HF, true);
        rows += mkRow('Total de dias úteis trabalhado', 'fas fa-calendar-day', 'text-cyan-500', s => s.diasUteis);
        rows += mkRow('Total de documentos Fifo', 'fas fa-sort-amount-down', 'text-slate-400', s => s.fifo);
        rows += mkRow('Total de documentos Gradual Parcial', 'fas fa-chart-area', 'text-teal-500', s => s.gp);
        rows += mkRow('Total de documentos Gradual Total', 'fas fa-chart-line', 'text-emerald-500', s => s.gt);
        rows += mkRow('Total de documentos Perfil Fc', 'fas fa-id-card', 'text-purple-500', s => s.fc);
        rows += mkRow('Total de documentos validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        rows += mkRow('Total validação diária Dias úteis', 'fas fa-calendar-check', 'text-amber-600', (s, d, HF) => (d > 0) ? s.qty / d : 0, true);
        rows += mkRow('Média validação diária Todas assistentes', 'fas fa-users', 'text-orange-600', (s, d, HF) => (HF > 0) ? s.qty / HF : 0, true);
        rows += mkRow('Média validação diária Por Assistentes', 'fas fa-user-tag', 'text-pink-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / d / HF : 0, true);
        
        tbody.innerHTML = rows;
        // Totalizador no rodapé também mostra o que foi usado (soma ou 17? Geralmente o consolidado é 17)
        document.getElementById('total-consolidado-footer').innerText = this.overridesHC[99]?.valor || this.PADRAO_HC;
    }
};