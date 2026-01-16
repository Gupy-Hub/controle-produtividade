async function entrar() {
    // Referências do HTML
    // Nota: Mantivemos o id="email" para não quebrar seu HTML, mas tratamos como ID numérico
    const idInput = document.getElementById('email'); 
    const senhaInput = document.getElementById('senha');
    const btn = document.querySelector('button');
    const originalBtnText = btn.innerHTML;
    
    // 1. Validação Básica
    if (!idInput.value || !senhaInput.value) {
        alert("Por favor, preencha seu ID e Senha.");
        return;
    }

    // 2. Prepara os dados (Converte ID para Número)
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
            
            // Salva na sessão
            localStorage.setItem('usuario', JSON.stringify(usuario));
            
            // Redireciona
            window.location.href = 'sistema.html';
        } else {
            throw new Error("Usuário não retornado pelo banco.");
        }

    } catch (erro) {
        console.error("Erro Login:", erro);
        
        // Tratamento de mensagens amigáveis
        let msg = erro.message || "Erro desconhecido";
        if (msg.includes("ID de usuário")) msg = "ID não encontrado.";
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