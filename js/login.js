/* ARQUIVO: js/login.js
   DESCRIÇÃO: Módulo de Autenticação (Com Hashing Client-Side)
*/

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

        // Validação básica de input
        if (!id || !senha) {
            this.mostrarErro('Preencha todos os campos.');
            return;
        }

        // Validação de tipo de ID (Evita envio de NaN para o RPC)
        if (isNaN(parseInt(id))) {
            this.mostrarErro('O ID deve ser numérico.');
            return;
        }

        // Feedback Visual (Loading)
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        btn.disabled = true;
        if(msgErro) msgErro.classList.add('hidden');

        try {
            // 1. GERA O HASH DA SENHA (SHA-256)
            // O banco espera o hash para comparar, nunca a senha em texto plano.
            const senhaHash = await Sistema.gerarHash(senha);

            // 2. Chamada segura ao banco
            const { data, error } = await Sistema.supabase.rpc('api_login', { 
                p_id: parseInt(id), 
                p_senha: senhaHash 
            });

            if (error) throw error;

            // --- SUCESSO ---
            Sistema.salvarSessao(data);

            // 3. Verificação de Troca de Senha Obrigatória
            if (data.trocar_senha === true) {
                alert("⚠️ AVISO DE SEGURANÇA:\n\nSua senha foi resetada pelo administrador.\nPor favor, defina uma nova senha assim que acessar o sistema.");
            }
            
            // 4. Redirecionamento baseado no perfil
            this.redirecionar(data);

        } catch (error) {
            console.error("Erro Login:", error);
            
            // Tratamento de Erros SQL (RPC)
            if (error.code === 'P0001') {
                this.mostrarErro('Senha incorreta.');
            } else if (error.code === 'P0002') {
                this.mostrarErro('Usuário não encontrado.');
            } else if (error.code === 'P0003') {
                this.mostrarErro('Acesso negado. Usuário inativo.');
            } else {
                // Fallback para erros genéricos (ex: timeout, network)
                this.mostrarErro('Erro ao conectar: ' + (error.message || 'Erro desconhecido'));
            }
        } finally {
            if (btn) {
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        }
    },

    redirecionar: function(usuario) {
        // Normaliza o perfil para evitar erros de Maiúscula/Minúscula
        const perfil = (usuario.perfil || '').toLowerCase().trim();
        const funcao = (usuario.funcao || '').toLowerCase().trim();

        // Lista de perfis com acesso ao Painel de Gestão
        const perfisGestao = ['admin', 'administrador', 'gestor', 'gestora'];

        // Verifica permissão
        if (perfisGestao.includes(perfil) || perfisGestao.includes(funcao)) {
            console.log("🔒 Acesso concedido: Painel de Gestão");
            window.location.href = 'gestao.html';
        } else {
            console.log("👤 Acesso concedido: Minha Área");
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

// Inicializa o módulo após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que o script sistema.js carregou
    setTimeout(() => Login.init(), 100);
});