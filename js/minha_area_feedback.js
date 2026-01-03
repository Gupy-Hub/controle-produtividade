const MA_Feedback = {
    carregar: async function() {
        const el = document.getElementById('lista-feedbacks');
        if(!el) return;

        const { data } = await _supabase.from('feedbacks').select('*').order('created_at', {ascending:true});
        if(!data || !data.length) { el.innerHTML = '<div class="text-center text-slate-300 py-12 italic">Nenhum feedback encontrado.</div>'; return; }
        
        let html='';
        data.forEach(m => {
            const isPub = m.usuario_alvo_id===null; 
            const isMe = m.usuario_alvo_id == MA_Main.sessao.id; 
            const isMine = m.autor_nome === MA_Main.sessao.nome;
            
            if(isPub || isMe || isMine) {
                const align = isMine ? 'ml-auto bg-blue-50 border-blue-100' : 'mr-auto bg-slate-50 border-slate-100';
                const badge = isPub ? '📢 TIME' : (isMine && m.usuario_alvo_id ? `🔒 ${MA_Main.usersMap[m.usuario_alvo_id]}` : '🔒 PRIVADO');
                
                html += `<div class="w-[85%] p-4 rounded-xl border mb-3 shadow-sm ${align}">
                            <div class="flex justify-between items-center mb-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
                                <span>${m.autor_nome} <span class="ml-1 bg-white border px-1 rounded text-[9px]">${badge}</span></span>
                                <span>${new Date(m.created_at).toLocaleDateString()}</span>
                            </div>
                            <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">${m.mensagem}</p>
                         </div>`;
            }
        });
        el.innerHTML = html; el.scrollTop = el.scrollHeight;
    },

    enviar: async function() {
        const txt = document.getElementById('input-feedback').value; 
        const dest = document.getElementById('feedback-destinatario').value;
        if(!txt.trim()) return;
        
        const aid = dest !== 'time' ? parseInt(dest) : null;
        await _supabase.from('feedbacks').insert({ 
            usuario_alvo_id: aid, 
            autor_nome: MA_Main.sessao.nome, 
            autor_funcao: MA_Main.sessao.funcao, 
            mensagem: txt 
        });
        
        document.getElementById('input-feedback').value = ''; 
        this.carregar();
    }
};