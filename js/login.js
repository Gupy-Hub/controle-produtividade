const Login = {
    init: function() {
        // Verifica se já tem sessão
        if (typeof Sistema === 'undefined') {
            console.error("Sistema não carregado.");
            return;
        }
        
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
            // --- MUDANÇA AQUI: ENVIA SENHA LIMPA ---
            // A criptografia agora é feita dentro do SQL para garantir compatibilidade total.
            
            const { data, error } = await Sistema.supabase.rpc('api_login', { 
                p_id: parseInt(id), 
                p_senha: senha 
            });

            if (error) throw error;

            // Sucesso
            Sistema.salvarSessao(data);
            
            // Redirecionamento baseado no perfil (Opcional, mas recomendado)
            if (data.perfil === 'admin' || data.perfil === 'gestor') {
                window.location.href = 'gestao.html';
            } else {
                window.location.href = 'minha_area.html';
            }

        } catch (error) {
            console.error("Erro Login:", error);
            
            if (error.code === 'P0001') {
                this.mostrarErro('Senha incorreta.');
            } else if (error.code === 'P0002') {
                this.mostrarErro('Usuário não encontrado.');
            } else if (error.code === 'P0003') {
                this.mostrarErro('Usuário inativo.');
            } else {
                this.mostrarErro('Erro ao conectar: ' + (error.message || 'Erro desconhecido'));
            }
        } finally {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    },

    mostrarErro: function(msg) {
        const el = document.getElementById('msg-erro');
        if(el) {
            el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
            el.classList.remove('hidden');
        } else {
            alert(msg);
        }
    }
};

// Inicializa (Proteção para garantir que carregou)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Login.init(), 100);
});