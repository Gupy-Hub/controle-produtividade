Gestao.Assertividade = {
    carregar: async function() {
        try {
            const { data } = await Gestao.supabase.from('metas_assertividade').select('*').order('data_inicio', {ascending:false});
            const container = document.getElementById('assert-list');
            if(!data?.length) { container.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Vazio.</div>'; return; }
            
            let html = ''; const hoje = new Date().toISOString().split('T')[0];
            data.forEach(m => {
                const isFuture = m.data_inicio > hoje;
                html += `<div class="p-3 mb-2 rounded-lg border ${isFuture ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-100'} flex justify-between items-center shadow-sm">
                    <div class="text-sm"><span class="block text-xs font-bold text-slate-400 uppercase">Vigência</span>${m.data_inicio.split('-').reverse().join('/')}</div>
                    <div class="text-xl font-black text-purple-700">${m.valor_minimo}%</div>
                </div>`;
            });
            container.innerHTML = html;
        } catch (e) { console.error(e); }
    },

    salvar: async function() {
        const data = document.getElementById('assert-date').value;
        const val = document.getElementById('assert-value').value;
        if (!data || !val) return alert("Preencha campos.");
        try {
            const { error } = await Gestao.supabase.from('metas_assertividade').insert({ data_inicio: data, valor_minimo: parseFloat(val) });
            if (error) throw error;
            alert("Salvo!"); 
            this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    }
};