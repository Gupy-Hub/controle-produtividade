const Login = {
    entrar: async function() {
        const idInput = document.getElementById('login-id').value.trim();
        const senhaInput = document.getElementById('login-senha').value.trim();
        const btn = document.getElementById('btn-login');
        const msg = document.getElementById('msg-erro');

        if (!idInput || !senhaInput) return this.mostrarErro("Preencha ID e Senha.");

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        msg.classList.add('hidden');

        try {
            // VERIFICAÇÃO DE SEGURANÇA: Garante que o sistema iniciou
            if (!Sistema.supabase) {
                throw new Error("Erro de conexão com o banco de dados. Recarregue a página.");
            }

            // 1. Busca o usuário
            const { data: usuario, error } = await Sistema.supabase
                .from('usuarios')
                .select('*')
                .eq('id', parseInt(idInput))
                .single();

            if (error || !usuario) throw new Error("Usuário não encontrado.");
            if (!usuario.ativo) throw new Error("Acesso inativo. Contate a gestão.");

            // 2. Gera o hash da senha digitada para comparar
            const hashDigitado = await Sistema.gerarHash(senhaInput);
            
            // Verifica a senha (compara Hash com Hash ou Texto Puro para compatibilidade com Admin antigo)
            let senhaCorreta = false;
            if (usuario.senha === 'Admin' && senhaInput === 'Admin') senhaCorreta = true;
            else if (usuario.senha === hashDigitado) senhaCorreta = true;

            if (!senhaCorreta) throw new Error("Senha incorreta.");

            // 3. Verifica Primeiro Acesso (Senha Padrão: gupy123)
            const hashPadrao = await Sistema.gerarHash('gupy123');
            if (usuario.senha === hashPadrao || senhaInput === 'gupy123') {
                const novaSenha = prompt("PRIMEIRO ACESSO\nPor segurança, defina sua nova senha:");
                if (!novaSenha || novaSenha.length < 4) {
                    throw new Error("Troca de senha cancelada ou muito curta. Login abortado.");
                }
                // Salva nova senha criptografada
                const novoHash = await Sistema.gerarHash(novaSenha);
                await Sistema.supabase.from('usuarios').update({ senha: novoHash }).eq('id', usuario.id);
                usuario.senha = novoHash; // Atualiza local
                alert("Senha atualizada com sucesso!");
            }

            // 4. Sucesso
            localStorage.setItem('usuario_logado', JSON.stringify(usuario));
            
            if (usuario.funcao === 'GESTORA' || usuario.funcao === 'AUDITORA' || usuario.perfil === 'admin') {
                window.location.href = 'gestao.html';
            } else {
                window.location.href = 'minha_area.html';
            }

        } catch (err) {
            console.error(err);
            this.mostrarErro(err.message);
            btn.disabled = false;
            btn.innerText = 'Entrar';
        }
    },

    mostrarErro: function(texto) {
        const msg = document.getElementById('msg-erro');
        if (msg) {
            msg.innerText = texto;
            msg.classList.remove('hidden');
        } else {
            alert(texto);
        }
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Login.entrar();
});