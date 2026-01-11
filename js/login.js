const Login = {
    entrar: async function() {
        const idInput = document.getElementById('login-id').value.trim();
        const senhaInput = document.getElementById('login-senha').value.trim();
        const btn = document.getElementById('btn-login');
        
        if (!idInput || !senhaInput) return this.mostrarErro("Preencha ID e Senha.");

        // Feedback visual
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        this.ocultarErro();

        try {
            if (!Sistema.supabase) {
                throw new Error("Erro de conexão. Recarregue a página.");
            }

            // CHAMADA SEGURA: Envia ID e Senha para o banco verificar
            // O banco retorna o usuário se tudo estiver certo, ou erro se falhar.
            const { data: usuario, error } = await Sistema.supabase
                .rpc('api_login', { 
                    p_id: parseInt(idInput), 
                    p_senha: senhaInput 
                });

            if (error) {
                // Tratamento de erros vindos do Banco
                throw new Error(error.message || "Erro ao verificar credenciais.");
            }

            if (!usuario) {
                throw new Error("Usuário não retornado.");
            }

            // 3. Verifica Fluxo de Primeiro Acesso (Sinalizado pelo banco)
            if (usuario.observacao === 'TROCAR_SENHA') {
                const novaSenha = prompt("PRIMEIRO ACESSO DETECTADO\nPor segurança, defina uma nova senha:");
                
                if (!novaSenha || novaSenha.length < 4) {
                    throw new Error("Troca de senha obrigatória cancelada.");
                }

                // Precisamos gerar o hash da NOVA senha para salvar.
                // Como removemos o hash do JS local, usamos uma chamada simples do banco ou 
                // reativamos uma função utilitária apenas para update.
                // SOLUÇÃO SIMPLES P/ INICIANTE: Envia a senha pura e deixa o banco tratar?
                // Para manter simples agora, vamos fazer um update manual gerando hash via SQL ou
                // (Temporary Fix) usamos uma função Web Crypto API nativa aqui só para o update.
                
                const novoHash = await this.gerarHashLocal(novaSenha);
                
                const { error: errUpdate } = await Sistema.supabase
                    .from('usuarios')
                    .update({ senha: novoHash })
                    .eq('id', usuario.id);

                if (errUpdate) throw new Error("Erro ao atualizar senha.");
                
                alert("Senha atualizada com sucesso! Use a nova senha no próximo login.");
                usuario.observacao = null; // Limpa flag
            }

            // 4. Sucesso - Salva sessão e Redireciona
            localStorage.setItem('usuario_logado', JSON.stringify(usuario));
            
            // Lógica de Redirecionamento baseada no Cargo/Função
            const funcao = (usuario.funcao || '').toUpperCase();
            const perfil = (usuario.perfil || '').toLowerCase();

            if (funcao === 'GESTORA' || funcao.includes('AUDITORA') || perfil === 'admin') {
                window.location.href = 'gestao.html';
            } else {
                window.location.href = 'minha_area.html';
            }

        } catch (err) {
            console.error(err);
            this.mostrarErro(err.message);
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    },

    // Função auxiliar apenas para a troca de senha (Update)
    gerarHashLocal: async function(texto) {
        const msgBuffer = new TextEncoder().encode(texto);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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