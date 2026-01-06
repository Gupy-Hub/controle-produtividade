const Login = {
    entrar: async function() {
        const idInput = document.getElementById('login-id').value.trim();
        const senhaInput = document.getElementById('login-senha').value.trim();
        const btn = document.getElementById('btn-login');
        const msg = document.getElementById('msg-erro');

        if (!idInput || !senhaInput) {
            this.mostrarErro("Preencha ID e Senha.");
            return;
        }

        // Feedback Visual
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        msg.classList.add('hidden');

        try {
            // Inicializa Supabase se necessário (caso Sistema.js ainda não tenha feito)
            if (!Sistema.supabase && window.supabase) {
                Sistema.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            }

            // Busca usuário pelo ID (login)
            const { data, error } = await Sistema.supabase
                .from('usuarios')
                .select('*')
                .eq('id', parseInt(idInput))
                .single();

            if (error || !data) {
                throw new Error("Usuário não encontrado.");
            }

            // Valida Senha (comparação simples conforme solicitado, ideal seria hash)
            // Valida também se está ATIVO
            if (data.senha !== senhaInput) {
                throw new Error("Senha incorreta.");
            }

            if (data.ativo === false || data.contrato === 'FINALIZADO') {
                throw new Error("Acesso negado. Usuário inativo.");
            }

            // Sucesso: Salva na sessão e redireciona
            localStorage.setItem('usuario_logado', JSON.stringify(data));

            // Redirecionamento inteligente
            if (data.funcao === 'Gestora' || data.funcao === 'Auditora') {
                window.location.href = 'gestao.html';
            } else {
                window.location.href = 'minha_area.html';
            }

        } catch (err) {
            console.error(err);
            this.mostrarErro(err.message === "JSON object requested, multiple (or no) rows returned" ? "Usuário não encontrado." : err.message);
            btn.disabled = false;
            btn.innerText = 'Entrar no Sistema';
        }
    },

    mostrarErro: function(texto) {
        const msg = document.getElementById('msg-erro');
        msg.innerText = texto;
        msg.classList.remove('hidden');
    }
};

// Permite login com Enter
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Login.entrar();
});