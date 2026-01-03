// js/produtividade_consolidado.js

const Cons = {
    initialized: false,
    
    init: function() { 
        if(!this.initialized) { 
            Sistema.Datas.criarInputInteligente('data-cons', KEY_DATA_GLOBAL, () => { this.carregar(); }); 
            this.initialized = true; 
        } 
        this.carregar(); 
    },
    
    carregar: async function() {
        const tbody = document.getElementById('cons-table-body'); 
        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-8 text-slate-400">A calcular indicadores...</td></tr>';
        
        const t = document.getElementById('cons-period-type').value; 
        const refDate = Sistema.Datas.lerInput('data-cons');
        const ano = refDate.getFullYear(); const mes = refDate.getMonth() + 1;
        let s, e;
        
        if (t === 'dia') { const iso = refDate.toISOString().split('T')[0]; s = iso; e = iso; }
        else if (t === 'mes') { s = `${ano}-${String(mes).padStart(2,'0')}-01`; e = `${ano}-${String(mes).padStart(2,'0')}-${new Date(ano, mes, 0).getDate()}`; }
        else if (t === 'trimestre') { const trim = Math.ceil(mes / 3); const mStart = ((trim-1)*3)+1; const mEnd = mStart+2; s = `${ano}-${String(mStart).padStart(2,'0')}-01`; e = `${ano}-${String(mEnd).padStart(2,'0')}-${new Date(ano, mEnd, 0).getDate()}`; }
        else if (t === 'semestre') { const sem = Math.ceil(mes / 6); s = sem === 1 ? `${ano}-01-01` : `${ano}-07-01`; e = sem === 1 ? `${ano}-06-30` : `${ano}-12-31`; } else { s = `${ano}-01-01`; e = `${ano}-12-31`; }

        try {
            const { data: rawData, error } = await _supabase.from('producao').select('*').gte('data_referencia', s).lte('data_referencia', e); 
            if(error) throw error;
            
            let cols = []; 
            if (t === 'dia') cols = ['Dia']; 
            else if (t === 'mes') cols = ['S1','S2','S3','S4','S5']; 
            else if (t === 'trimestre') cols = ['Mês 1','Mês 2','Mês 3']; 
            else if (t === 'semestre') cols = ['M1','M2','M3','M4','M5','M6']; 
            else cols = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            
            const numCols = cols.length; 
            let st = {}; for(let i=1; i<=numCols; i++) st[i] = this.newStats(); st[99] = this.newStats();
            
            rawData.forEach(r => {
                const uid = r.usuario_id;
                const user = USERS_CACHE[uid];
                if (!user || user.funcao !== 'Assistente') return;

                let b = 1; const dt = new Date(r.data_referencia + 'T12:00:00');
                if(t === 'mes') { const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); b = Math.ceil((dt.getDate() + firstDay) / 7); }
                else if (t === 'trimestre') b = (dt.getMonth() % 3) + 1; 
                else if (t === 'semestre') b = (dt.getMonth() % 6) + 1; 
                else if (t === 'ano_mes') b = dt.getMonth() + 1;
                
                if(b > numCols) b = numCols;
                
                const sys = Number(r.quantidade) || 0;
                [b, 99].forEach(k => {
                    if(!st[k]) return; 
                    const x = st[k];
                    x.users.add(r.usuario_id); x.dates.add(r.data_referencia); 
                    x.qty += sys; x.fifo += (Number(r.fifo)||0); x.gt += (Number(r.gradual_total)||0); x.gp += (Number(r.gradual_parcial)||0); x.fc += (Number(r.perfil_fc)||0);
                    
                    if (user.contrato && user.contrato.includes('CLT')) { x.clt_users.add(r.usuario_id); x.clt_qty += sys; } 
                    else { x.pj_users.add(r.usuario_id); x.pj_qty += sys; }
                });
            });

            const hRow = document.getElementById('cons-table-header'); 
            if(hRow) hRow.innerHTML = `<th class="px-4 py-3 sticky left-0 bg-slate-50 z-20 border-r border-slate-200">Indicadores</th>` + cols.map(c => `<th class="px-4 py-3 text-center border-l border-slate-100">${c}</th>`).join('') + `<th class="px-4 py-3 text-center bg-blue-50 text-blue-800 border-l border-blue-100">TOTAL</th>`;
            
            let h = ''; 
            const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);
            
            const mkRow = (label, getter, isCalc=false, isBold=false, isSub=false) => {
                const rowClass = isBold ? 'row-total' : (isSub ? 'row-sub' : 'hover:bg-slate-50'); 
                let tr = `<tr class="${rowClass} border-b border-slate-100"><td class="px-4 py-3 font-medium col-fixed">${label}</td>`;
                idxs.forEach(i => {
                    const s = st[i]; const dias = s.dates.size || 1; const ativos = s.users.size || 1; const ac = s.clt_users.size || 1; const ap = s.pj_users.size || 1;
                    let val = 0; if (!isCalc) { val = getter(s); if (val instanceof Set) val = val.size; } else { val = getter(s, dias, ativos, ac, ap); }
                    const txt = val ? Math.round(val).toLocaleString() : (isBold ? '0' : '-'); const cellClass = i === 99 ? 'bg-blue-50 font-bold border-l border-blue-100 text-blue-900' : 'text-center border-l border-slate-50'; tr += `<td class="${cellClass} px-2 py-2">${txt}</td>`;
                });
                return tr + '</tr>';
            };
            
            const HF = 17;
            h += mkRow('Ativos', s => s.users); h += mkRow('Dias Trabalhados', s => s.dates); h += mkRow('FIFO', s => s.fifo); h += mkRow('G. Parcial', s => s.gp); h += mkRow('G. Total', s => s.gt); h += mkRow('Perfil FC', s => s.fc); h += mkRow('Produção Total', s => s.qty, false, true);
            h += mkRow('Média Diária (Time)', (s, d) => s.qty / d, true); h += mkRow(`Média/Assist (Base ${HF})`, (s) => s.qty / HF, true); h += mkRow(`Média Dia/Assist (Base ${HF})`, (s, d) => s.qty / d / HF, true);
            h += `<tr><td colspan="${numCols + 2}" class="px-4 py-6 bg-slate-50 font-bold text-slate-400 text-xs uppercase tracking-widest text-center border-y border-slate-200">Segmentação por Contrato</td></tr>`;
            h += mkRow('Produção CLT', s => s.clt_qty); h += mkRow('Média Diária/CLT', (s, d, a, ac) => s.clt_qty / d / ac, true);
            h += mkRow('Produção PJ', s => s.pj_qty); h += mkRow('Média Diária/PJ', (s, d, a, ac, ap) => s.pj_qty / d / ap, true);
            
            if(tbody) tbody.innerHTML = h;
            
            const tot = st[99]; const dTot = tot.dates.size || 1; 
            document.getElementById('cons-p-total').innerText = tot.qty.toLocaleString(); 
            document.getElementById('cons-p-media-time').innerText = Math.round(tot.qty / dTot).toLocaleString(); 
            document.getElementById('cons-p-media-ind').innerText = Math.round(tot.qty / dTot / HF).toLocaleString(); 
            document.getElementById('cons-p-headcount').innerText = tot.users.size;
        } catch (e) { console.error(e); }
    },
    
    newStats: function() { return { users: new Set(), dates: new Set(), qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, clt_users: new Set(), clt_qty: 0, pj_users: new Set(), pj_qty: 0 }; }
};