const Geral = {
    listaAtual: [],
    selecionado: null,
    dataVisualizada: null,
    periodoInicio: null,
    periodoFim: null,

    toggleSemana: function() {
        const mode = document.getElementById('view-mode').value;
        const selSemana = document.getElementById('select-semana');
        if (mode === 'semana') selSemana.classList.remove('hidden'); else selSemana.classList.add('hidden');
        this.carregarTela();
    },
    
    excluirDadosDia: async function() {
        if (document.getElementById('view-mode').value !== 'dia') { alert("Use a visualização 'Dia'."); return; }
        const data = this.dataVisualizada;
        if (!data) return;
        if (!confirm(`EXCLUIR dados de ${data}?`)) return;
        const { error } = await _supabase.from('producao').delete().eq('data_referencia', data);
        if (error) alert("Erro ao excluir."); else { alert("Excluído!"); this.carregarTela(); }
    },
    
    carregarTela: async function() {
        const mode = document.getElementById('view-mode').value;
        const globalDate = document.getElementById('global-date').value || new Date().toISOString().split('T')[0];
        this.dataVisualizada = globalDate;
        const [ano, mes] = globalDate.split('-').map(Number);

        let s, e;
        if (mode === 'dia') { s=e=globalDate; }
        else if (mode === 'mes') { s = new Date(ano, mes-1, 1).toLocaleDateString('en-CA'); e = new Date(ano, mes, 0).toLocaleDateString('en-CA'); }
        else {
            const numSemana = parseInt(document.getElementById('select-semana').value) || 1;
            const ultimoDiaMes = new Date(ano, mes, 0).getDate();
            let semanaAtual = 1, dataIniSemana = null, dataFimSemana = null;
            for (let d = 1; d <= ultimoDiaMes; d++) {
                const dataLoop = new Date(ano, mes - 1, d);
                if (semanaAtual === numSemana) { if (!dataIniSemana) dataIniSemana = new Date(dataLoop); dataFimSemana = new Date(dataLoop); }
                if (dataLoop.getDay() === 6) semanaAtual++;
                if (semanaAtual > numSemana) break;
            }
            if (dataIniSemana && dataFimSemana) { s = dataIniSemana.toLocaleDateString('en-CA'); e = dataFimSemana.toLocaleDateString('en-CA'); }
            else { s=e=globalDate; }
        }
        this.periodoInicio = s; this.periodoFim = e;

        const { data } = await _supabase.from('producao').select('*').gte('data_referencia', s).lte('data_referencia', e);
        this.listaAtual = Sistema.Dados.normalizar(data || []);
        this.renderizar();
    },

    contarDiasUteis: function(s, e) {
        let c=0, d=new Date(s+'T12:00:00'), f=new Date(e+'T12:00:00');
        while(d<=f){ if(d.getDay()!==0 && d.getDay()!==6)c++; d.setDate(d.getDate()+1); }
        return c;
    },

    mudarFator: function(nome, valor) {
        if(document.getElementById('view-mode').value !== 'dia') { alert("Apenas no modo Dia."); return; }
        let m = "";
        if(valor==="0"||valor==="0.5") {
            m = prompt("Motivo:", Sistema.Dados.obterMotivo(nome, this.dataVisualizada));
            if(m===null) { this.renderizar(); return; }
        }
        Sistema.Dados.definirFator(nome, this.dataVisualizada, valor);
        Sistema.Dados.definirMotivo(nome, this.dataVisualizada, m);
        this.carregarTela();
    },

    mudarFatorTodos: function(valor) {
        if(!valor) return;
        if(document.getElementById('view-mode').value !== 'dia') { alert("Apenas no modo Dia."); return; }
        let m = "";
        if(valor==="0"||valor==="0.5") {
            m = prompt("Motivo (Todos):");
            if(m===null) { document.getElementById('bulk-fator').value=""; return; }
        }
        if(confirm("Aplicar a todos?")) {
            this.listaAtual.forEach(u => { if(!u.inativo) { Sistema.Dados.definirFator(u.nome, this.dataVisualizada, valor); Sistema.Dados.definirMotivo(u.nome, this.dataVisualizada, m); } });
            this.carregarTela();
        }
    },

    selecionar: function(n) { this.selecionado = this.selecionado===n?null:n; this.renderizar(); },
    limparSelecao: function() { this.selecionado=null; this.renderizar(); },

    renderizar: function() {
        const tbody = document.getElementById('tabela-corpo'); tbody.innerHTML='';
        const mode = document.getElementById('view-mode').value;
        const ativos = this.listaAtual.filter(u=>!u.inativo);
        const totalProd = this.selecionado 
            ? this.listaAtual.filter(u=>u.nome===this.selecionado).reduce((a,b)=>a+b.total,0)
            : ativos.reduce((a,b)=>a+b.total,0);

        const diasUteis = this.contarDiasUteis(this.periodoInicio, this.periodoFim);
        
        let clt=0, pj=0;
        ativos.forEach(u => {
            const user = Sistema.Dados.usuariosCache[u.ids.values().next().value];
            if(user) {
                if(user.contrato === 'CLT') clt++;
                else if(user.contrato === 'PJ') pj++;
            }
        });
        const totalPessoas = clt + pj;
        
        if (totalPessoas > 0) {
            document.getElementById('kpi-pct-clt').innerText = Math.round((clt/totalPessoas)*100) + '%';
            document.getElementById('kpi-pct-pj').innerText = Math.round((pj/totalPessoas)*100) + '%';
        } else {
            document.getElementById('kpi-pct-clt').innerText = '0%';
            document.getElementById('kpi-pct-pj').innerText = '0%';
        }
        document.getElementById('kpi-count-clt').innerText = clt;
        document.getElementById('kpi-count-pj').innerText = pj;

        let hc = (mode === 'dia') ? totalPessoas : Sistema.Dados.obterBaseHC(this.dataVisualizada);
        if (this.selecionado) hc = 1;

        document.getElementById('kpi-dias').innerText = diasUteis;
        document.getElementById('kpi-total').innerText = totalProd.toLocaleString();
        const metaTotal = diasUteis * hc * 650;
        document.getElementById('kpi-meta-total').innerText = metaTotal.toLocaleString();

        const mediaTodas = diasUteis > 0 ? Math.round(totalProd / diasUteis) : 0;
        document.getElementById('kpi-media-todas').innerText = mediaTodas.toLocaleString();

        const mediaInd = hc > 0 ? Math.round(mediaTodas / hc) : 0;
        document.getElementById('kpi-media-assist').innerText = mediaInd.toLocaleString();
        document.getElementById('kpi-meta-media').innerText = "650";

        const pct = metaTotal > 0 ? Math.round((totalProd/metaTotal)*100) : 0;
        document.getElementById('kpi-pct').innerText = pct + '%';
        
        const selHeader = document.getElementById('selection-header');
        if(this.selecionado) { selHeader.classList.remove('hidden'); document.getElementById('selected-name').innerText=this.selecionado; }
        else selHeader.classList.add('hidden');

        if(this.listaAtual.length===0) tbody.innerHTML='<tr><td colspan="9" class="text-center py-4">Sem dados.</td></tr>';

        this.listaAtual.forEach(u => {
            const isSel = this.selecionado===u.nome;
            const cls = isSel ? 'selected-row' : 'hover:bg-slate-50';
            const op = u.inativo ? 'row-ignored' : '';
            let f = 1;
            if(mode==='dia') { const d=u.diasMap[this.dataVisualizada]; f=d?d.fator:1; }
            
            const motivo = Sistema.Dados.obterMotivo(u.nome, this.dataVisualizada);
            const icon = motivo ? `<i class="fas fa-info-circle text-blue-400 ml-1 text-xs" title="${motivo}"></i>` : '';
            
            const pctInd = u.meta > 0 ? Math.round((u.total/u.meta)*100) : 0;
            const bdg = pctInd>=100 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';

            const sel = `<div class="flex items-center justify-center"><select class="status-select ${f===1?'st-1':(f===0.5?'st-05':'st-0')} ${mode!=='dia'?'disabled':''}" onchange="Geral.mudarFator('${u.nome}', this.value)" onclick="event.stopPropagation()"><option value="1" ${f===1?'selected':''}>100%</option><option value="0.5" ${f===0.5?'selected':''}>50%</option><option value="0" ${f===0?'selected':''}>0%</option></select>${icon}</div>`;

            tbody.innerHTML += `<tr class="${cls} ${op} border-b border-slate-100 cursor-pointer"><td class="px-4 py-4 text-center">${sel}</td><td class="px-6 py-4 font-bold text-slate-700" onclick="Geral.selecionar('${u.nome}')">${u.nome}</td><td class="px-6 py-4 text-center">${u.dias}</td><td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td><td class="px-6 py-4 text-center">${u.fifo}</td><td class="px-6 py-4 text-center">${u.gt}</td><td class="px-6 py-4 text-center">${u.gp}</td><td class="px-6 py-4 text-center text-slate-400">${u.meta.toLocaleString()}</td><td class="px-6 py-4 text-center"><span class="${bdg} px-2 py-1 rounded text-xs font-bold border">${pctInd}%</span></td></tr>`;
        });
    }
};