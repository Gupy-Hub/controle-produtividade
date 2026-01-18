const Login = {
    init: function() {
        // Verifica se já tem sessão
        const sessao = Sistema.lerSessao();
        if (sessao) {
            window.location.href = 'minha_area.html';
        }
    },

    entrar: async function() {
        const idInput = document.getElementById('login-id');
        const senhaInput = document.getElementById('login-senha');
        const btn = document.querySelector('button');
        const msgErro = document.getElementById('msg-erro');

        const id = idInput.value.trim();
        const senha = senhaInput.value.trim();

        if (!id || !senha) {
            this.mostrarErro('Preencha todos os campos.');
            return;
        }

        // Feedback Visual
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        btn.disabled = true;
        msgErro.classList.add('hidden');

        try {
            // --- CRIPTOGRAFIA ATIVADA 🔒 ---
            // O frontend gera o Hash e envia apenas o Hash para a API.
            // A senha real nunca viaja "pura" pela rede, exceto na criação do hash local.
            const senhaHash = await Sistema.gerarHash(senha);

            const { data, error } = await Sistema.supabase.rpc('api_login', { 
                p_id: parseInt(id), 
                p_senha: senhaHash 
            });

            if (error) throw error;

            // Sucesso
            Sistema.salvarSessao(data);
            window.location.href = 'minha_area.html';

        } catch (error) {
            console.error("Erro Login:", error);
            
            if (error.code === 'P0001') {
                this.mostrarErro('Senha incorreta.');
            } else if (error.code === 'P0002') {
                this.mostrarErro('Usuário não encontrado.');
            } else if (error.code === 'P0003') {
                this.mostrarErro('Usuário inativo. Contate a gestão.');
            } else {
                this.mostrarErro('Erro ao conectar. Tente novamente.');
            }
        } finally {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    },

    mostrarErro: function(msg) {
        const el = document.getElementById('msg-erro');
        el.innerText = msg;
        el.classList.remove('hidden');
    }
};

// Inicializa
Login.init();