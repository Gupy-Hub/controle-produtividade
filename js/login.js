const Login = {
    entrar: async function() {
        const idInput = document.getElementById('login-id').value.trim();
        const senhaInput = document.getElementById('login-senha').value.trim();
        const btn = document.getElementById('btn-login');
        
        if (!idInput || !senhaInput) return this.mostrarErro("Preencha ID e Senha.");

        // Feedback visual
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        this.ocultarErro();

        try {
            if (!Sistema.supabase) {
                throw new Error("Erro de conexão. Recarregue a página.");
            }

            // Chamada RPC corrigida (via p_id e p_senha)
            const { data: usuario, error } = await Sistema.supabase
                .rpc('api_login', { 
                    p_id: parseInt(idInput), 
                    p_senha: senhaInput 
                });

            if (error) {
                console.error("Erro SQL:", error);
                throw new Error(error.message || "Erro ao verificar credenciais.");
            }

            if (!usuario) {
                throw new Error("Usuário não retornado.");
            }

            // Sucesso - Salva sessão
            localStorage.setItem('usuario_logado', JSON.stringify(usuario));
            
            // Redirecionamento Inteligente
            const funcao = (usuario.funcao || '').toUpperCase();
            
            if (funcao === 'GESTORA' || funcao.includes('AUDITORA')) {
                window.location.href = 'gestao.html';
            } else {
                window.location.href = 'minha_area.html';
            }

        } catch (err) {
            console.error(err);
            // Tradução amigável de erros comuns
            let msg = err.message;
            if (msg.includes("incorretos")) msg = "ID ou Senha incorretos.";
            if (msg.includes("inativo")) msg = "Seu acesso está inativo. Procure a gestão.";
            
            this.mostrarErro(msg);
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    },

    mostrarErro: function(texto) {
        const msg = document.getElementById('msg-erro');
        if (msg) {
            msg.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${texto}`;
            msg.classList.remove('hidden');
        } else {
            alert(texto);
        }
    },

    ocultarErro: function() {
        const msg = document.getElementById('msg-erro');
        if (msg) msg.classList.add('hidden');
    }
};

// Evento de tecla Enter
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Login.entrar();
});