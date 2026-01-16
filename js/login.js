// js/login.js

async function entrar() {
    // Referências do HTML
    const idInput = document.getElementById('email'); 
    const senhaInput = document.getElementById('senha');
    const btn = document.querySelector('button');
    const originalBtnText = btn.innerHTML;
    
    // 1. Validação Básica
    if (!idInput.value || !senhaInput.value) {
        alert("Por favor, preencha seu ID e Senha.");
        return;
    }

    // 2. Prepara os dados
    const idUsuario = parseInt(idInput.value.trim());
    const senhaUsuario = senhaInput.value;

    if (isNaN(idUsuario)) {
        alert("O ID deve ser apenas números.");
        return;
    }

    try {
        // Estado de Carregamento
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        btn.disabled = true;

        console.log("Tentando logar com ID:", idUsuario);

        // 3. Chama o Supabase (Função RPC)
        const { data, error } = await Sistema.supabase
            .rpc('api_login', { 
                p_id: idUsuario, 
                p_senha: senhaUsuario 
            });

        if (error) throw error;

        // 4. Sucesso
        if (data && data.length > 0) {
            const usuario = data[0];
            console.log("Login Sucesso:", usuario.nome);
            
            // [CORREÇÃO 1] Salva com o nome que o sistema.js espera ('usuario_logado')
            localStorage.setItem('usuario_logado', JSON.stringify(usuario));
            
            // [CORREÇÃO 2] Redirecionamento Inteligente
            // Se for sistema.html (que não existe), manda para a dashboard correta
            if (usuario.nivel_acesso === 'admin') {
                window.location.href = 'gestao.html'; // Página de Gestão para Admins
            } else {
                window.location.href = 'minha_area.html'; // Página Padrão para Usuários
            }
        } else {
            throw new Error("Usuário não retornado pelo banco.");
        }

    } catch (erro) {
        console.error("Erro Login:", erro);
        
        let msg = erro.message || "Erro desconhecido";
        if (msg.includes("ID incorreto")) msg = "ID não encontrado.";
        if (msg.includes("Senha incorreta")) msg = "Senha incorreta.";
        if (msg.includes("crypt")) msg = "Erro de criptografia no banco.";

        alert("Falha ao entrar: " + msg);
        
        // Reseta o botão
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

// Garante que o enter funcione
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        entrar();
    }
});