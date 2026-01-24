/* ARQUIVO: js/login.js
   DESCRIÇÃO: Gerenciamento de Login e Redirecionamento Inteligente
*/

const Login = {
    init: async function() {
        console.log("🔒 Login: Verificando sessão...");
        
        // Verifica se já existe sessão ativa
        const { data: { session } } = await Sistema.supabase.auth.getSession();

        if (session) {
            console.log("✅ Sessão ativa detectada.");
            await this.redirecionarUsuario(session.user);
        } else {
            // Se não tiver sessão, ativa o formulário
            this.bindEvents();
            document.getElementById('form-login').classList.remove('hidden');
            document.getElementById('loading-screen').classList.add('hidden');
        }
    },

    bindEvents: function() {
        const btnEntrar = document.getElementById('btn-entrar');
        const inputEmail = document.getElementById('email');
        const inputSenha = document.getElementById('senha');

        btnEntrar.addEventListener('click', () => this.fazerLogin());
        
        // Login com Enter
        inputSenha.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fazerLogin();
        });
    },

    fazerLogin: async function() {
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        const btn = document.getElementById('btn-entrar');
        const msgErro = document.getElementById('msg-erro');

        if (!email || !senha) {
            this.mostrarErro("Preencha todos os campos.");
            return;
        }

        // Feedback visual
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        msgErro.classList.add('hidden');

        try {
            const { data, error } = await Sistema.supabase.auth.signInWithPassword({
                email: email,
                password: senha
            });

            if (error) throw error;

            console.log("🚀 Login realizado com sucesso!");
            this.redirecionarUsuario(data.user);

        } catch (err) {
            console.error("Erro Login:", err);
            this.mostrarErro("E-mail ou senha incorretos.");
            btn.disabled = false;
            btn.innerText = 'Entrar';
        }
    },

    redirecionarUsuario: async function(user) {
        // Busca perfil para saber se é admin
        const { data: perfil } = await Sistema.supabase
            .from('usuarios')
            .select('admin, gestor')
            .eq('id', user.id)
            .single();

        const isAdmin = perfil && (perfil.admin || perfil.gestor);

        console.log("🔀 Redirecionando...", isAdmin ? "(Admin)" : "(User)");

        // LÓGICA DE OURO: Verifica se veio de algum lugar específico
        // Ex: se a URL for index.html?redirect=minha_area.html
        const urlParams = new URLSearchParams(window.location.search);
        const destino = urlParams.get('redirect');

        if (destino) {
            window.location.href = destino;
        } else {
            // Se não tiver destino, aí sim usa o padrão
            if (isAdmin) {
                // OBS: Mudei para minha_area.html para você testar. 
                // Depois você pode voltar para gestao.html se preferir.
                window.location.href = 'minha_area.html'; 
            } else {
                window.location.href = 'minha_area.html';
            }
        }
    },

    mostrarErro: function(msg) {
        const el = document.getElementById('msg-erro');
        el.innerText = msg;
        el.classList.remove('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Login.init();
});