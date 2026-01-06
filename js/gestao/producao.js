Gestao.Producao = {
    carregar: async function() {
        const container = document.getElementById('meta-list');
        const uid = document.getElementById('meta-user').value;
        
        if (!uid || uid === "Carregando...") { 
            // Se o select ainda não carregou ou não tem user, tenta esperar ou mostra msg
            // Mas normalmente o Equipe.carregar() já populou.
            if(!uid) container.innerHTML = '<div class="text-xs text-slate-400 italic text-center py-10">Selecione um usuário.</div>'; 
            return; 
        }

        try {
            let query = Gestao.supabase.from('metas').select('*, usuarios(nome)').order('data_inicio', { ascending: false });
            if (uid !== 'all') query = query.eq('usuario_id', uid); else query = query.limit(50);
            
            const { data } = await query;
            if (!data?.length) { container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Sem histórico.</div>'; return; }

            let html = ''; const hoje = new Date().toISOString().split('T')[0];
            data.forEach(m => {
                const isFuture = m.data_inicio > hoje;
                const style = isFuture ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-white border-slate-100 text-slate-700';
                html += `<div class="p-3 rounded-lg border mb-2 ${style} shadow-sm text-sm flex justify-between items-center">
                    <div>
                        <div class="font-bold">${m.usuarios?.nome}</div>
                        <div class="text-xs opacity-75">Início: ${m.data_inicio.split('-').reverse().join('/')}</div>
                    </div>
                    <div class="text-lg font-black">${m.valor_meta}</div>
                </div>`;
            });
            container.innerHTML = html;
        } catch (e) { console.error(e); }
    },

    salvar: async function() {
        const uid = document.getElementById('meta-user').value;
        const data = document.getElementById('meta-date').value;
        const val = document.getElementById('meta-value').value;
        if (!uid || !data || !val) return alert("Preencha todos campos.");

        try {
            // Se for 'all', pega todos os assistentes da lista carregada em Equipe
            const assistentes = Gestao.dados.usuarios.filter(u => u.funcao === 'Assistente');
            
            const payload = uid === 'all' 
                ? assistentes.map(u => ({ usuario_id: u.id, data_inicio: data, valor_meta: parseInt(val) }))
                : { usuario_id: uid, data_inicio: data, valor_meta: parseInt(val) };
            
            const { error } = await Gestao.supabase.from('metas').upsert(payload, { onConflict: 'usuario_id,data_inicio' });
            if (error) throw error;
            
            alert("Meta salva!");
            this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    }
};