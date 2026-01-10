MinhaArea.Diario = {
    initialized: false,
    
    init: function() {
        if (!this.initialized) this.initialized = true;
        
        const inputData = document.getElementById('input-data-lancamento');
        if (inputData && !inputData.value) {
            inputData.value = new Date().toISOString().split('T')[0];
        }
        
        this.carregarDadosDoDia();
        this.carregarHistoricoRecente();
        this.atualizarKPIsMensais();
    },

    carregarDadosDoDia: async function() {
        const data = document.getElementById('input-data-lancamento').value;
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        this.atualizarStatus('carregando');
        this.limparFormulario();

        try {
            const { data: reg, error } = await Sistema.supabase.from('producao').select('*').eq('usuario_id', uid).eq('data_referencia', data).maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;

            if (reg) {
                document.getElementById('input-quantidade').value = reg.quantidade || '';
                document.getElementById('input-fifo').value = reg.fifo || '';
                document.getElementById('input-gt').value = reg.gradual_total || '';
                document.getElementById('input-gp').value = reg.gradual_parcial || '';
                document.getElementById('input-fc').value = reg.perfil_fc || '';
                document.getElementById('input-obs').value = reg.justificativa || '';
                this.atualizarStatus('salvo');
            } else {
                this.atualizarStatus('novo');
            }
        } catch (err) { console.error(err); this.atualizarStatus('erro'); }
    },

    salvar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return alert("Erro de sessão.");

        const dataRef = document.getElementById('input-data-lancamento').value;
        const dados = {
            usuario_id: uid,
            data_referencia: dataRef,
            quantidade: document.getElementById('input-quantidade').value || 0,
            fifo: document.getElementById('input-fifo').value || 0,
            gradual_total: document.getElementById('input-gt').value || 0,
            gradual_parcial: document.getElementById('input-gp').value || 0,
            perfil_fc: document.getElementById('input-fc').value || 0,
            justificativa: document.getElementById('input-obs').value,
            fator: 1
        };

        try {
            const { data: existente } = await Sistema.supabase.from('producao').select('id').eq('usuario_id', uid).eq('data_referencia', dataRef).maybeSingle();
            if (existente) { await Sistema.supabase.from('producao').update(dados).eq('id', existente.id); } 
            else { await Sistema.supabase.from('producao').insert(dados); }

            alert("Salvo com sucesso!");
            this.atualizarStatus('salvo');
            this.carregarHistoricoRecente();
            this.atualizarKPIsMensais();
        } catch (err) { alert("Erro ao salvar: " + err.message); }
    },

    carregarHistoricoRecente: async function() {
        const tbody = document.getElementById('tabela-historico-body');
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!tbody || !uid) return;

        try {
            const { data, error } = await Sistema.supabase.from('producao').select('*').eq('usuario_id', uid).order('data_referencia', { ascending: false }).limit(10);
            if (error) throw error;

            tbody.innerHTML = '';
            if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 text-xs italic">Vazio.</td></tr>'; return; }

            data.forEach(r => {
                const [ano, mes, dia] = r.data_referencia.split('-');
                let statusIcon = r.fator == 1 ? '<span class="text-emerald-500 font-bold text-[10px]">Normal</span>' : '<span class="text-amber-500 font-bold text-[10px]">Ajustado</span>';
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-50 last:border-0";
                tr.innerHTML = `<td class="px-4 py-2 font-bold text-slate-600">${dia}/${mes}</td><td class="px-4 py-2 text-center font-black text-blue-600">${r.quantidade}</td><td class="px-4 py-2 text-center text-slate-500">${r.fator}</td><td class="px-4 py-2 text-center">${statusIcon}</td><td class="px-4 py-2 text-slate-400 text-[10px] truncate max-w-[80px]" title="${r.justificativa||''}">${r.justificativa||'-'}</td>`;
                tbody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    },

    atualizarKPIsMensais: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

        try {
            const { data } = await Sistema.supabase.from('producao').select('quantidade, fator').eq('usuario_id', uid).gte('data_referencia', inicio).lte('data_referencia', fim);
            let total = 0, diasUteis = 0, diasTrab = 0;
            data.forEach(r => { total += (Number(r.quantidade)||0); const f = Number(r.fator)||0; diasUteis += f; if(f>0) diasTrab++; });
            
            const meta = diasUteis * 650;
            const pct = meta > 0 ? (total/meta)*100 : 0;
            const media = diasTrab > 0 ? Math.round(total/diasTrab) : 0;

            this.setTxt('kpi-total', total.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-total', Math.round(meta).toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', Math.round(pct)+'%');
            this.setTxt('kpi-media', media.toLocaleString('pt-BR'));
            const bar = document.getElementById('bar-progress'); if(bar) bar.style.width = Math.min(pct,100)+'%';
        } catch (e) {}
    },

    // Helpers
    limparFormulario: function() { ['input-quantidade','input-fifo','input-gt','input-gp','input-fc','input-obs'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; }); },
    atualizarStatus: function(s) { const el = document.getElementById('status-lancamento'); if(el) el.innerText = s === 'carregando' ? '...' : s === 'novo' ? 'Novo' : 'Salvo'; },
    setTxt: function(id, v) { const el = document.getElementById(id); if(el) el.innerText = v; }
};