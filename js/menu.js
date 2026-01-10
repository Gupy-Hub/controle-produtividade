// Onde está:
if (isGestao) {
    links.push({ nome: 'Gestão', url: 'gestao.html', icon: 'fas fa-cogs' });
}

// Como deve ficar (Engineered Solution):
if (isGestao) {
    // Apontamos para o módulo de usuários que parece ser a home da gestão
    links.push({ nome: 'Gestão', url: 'gestao/usuarios.html', icon: 'fas fa-cogs' });
}