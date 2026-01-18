const Login = {
    init: function() {
        // Verifica se o Sistema foi carregado corretamente
        if (typeof Sistema === 'undefined') {
            console.error("Sistema não carregado. Verifique a ordem dos scripts no index.html.");
            return;
        }
        
        // Se já estiver logado, redireciona
        const sessao = Sistema.lerSessao();
        if (sessao) {
            this.redirecionar(sessao);
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

        // Feedback Visual (Loading)
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        btn.disabled = true;
        if(msgErro) msgErro.classList.add('hidden');

        try {
            // --- CHAMADA SEGURA AO BANCO ---
            // O frontend envia a senha "limpa" via HTTPS.
            // O Banco (SQL) faz o Hash e compara, garantindo segurança total.
            
            const { data, error } = await Sistema.supabase.rpc('api_login', { 
                p_id: parseInt(id), 
                p_senha: senha 
            });

            if (error) throw error;

            // --- SUCESSO ---
            Sistema.salvarSessao(data);

            // 1. Verificação de Troca de Senha Obrigatória
            if (data.trocar_senha === true) {
                alert("⚠️ AVISO DE SEGURANÇA:\n\nSua senha foi resetada pelo administrador.\nPor favor, defina uma nova senha assim que acessar o sistema.");
                // Futuramente, aqui redirecionaremos para uma tela de 'trocar_senha.html'
            }
            
            // 2. Redirecionamento baseado no Perfil
            this.redirecionar(data);

        } catch (error) {
            console.error("Erro Login:", error);
            
            // Tratamento de Erros Específicos do SQL (RPC)
            if (error.code === 'P0001') {
                this.mostrarErro('Senha incorreta.');
            } else if (error.code === 'P0002') {
                this.mostrarErro('Usuário não encontrado.');
            } else if (error.code === 'P0003') {
                this.mostrarErro('Acesso negado. Usuário inativo.');
            } else {
                this.mostrarErro('Erro ao conectar: ' + (error.message || 'Erro desconhecido'));
            }
        } finally {
            // Restaura o botão se algo der errado (se der certo, a página muda antes)
            if (btn) {
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        }
    },

    redirecionar: function(usuario) {
        if (usuario.perfil === 'admin' || usuario.perfil === 'gestor') {
            window.location.href = 'gestao.html';
        } else {
            window.location.href = 'minha_area.html';
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

// Inicializa o módulo quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que config.js e sistema.js carregaram
    setTimeout(() => Login.init(), 100);
});