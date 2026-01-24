/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Principal da Minha Área
   ATUALIZAÇÃO: Correção de Loop de Redirect + Seletor de Equipe
*/

const MinhaArea = {
    abaAtual: 'diario', 
    usuarioAlvo: null, 
    
    periodo: {
        tipo: 'mes', 
        ano: new Date().getFullYear(),
        mes: new Date().getMonth(),
        semana: 1,
        sub: 'full'
    },

    init: async function() {
        console.log("🚀 Minha Área: Iniciando...");
        
        // --- CORREÇÃO DO LOOP DE LOGIN ---
        // Em vez de checar Sistema.usuario direto (que pode estar vazio no load),
        // perguntamos ao Supabase se existe uma sessão válida.
        const { data: { session } } = await Sistema.supabase.auth.getSession();

        if (!session) {
            console.warn("⛔ Sem sessão. Redirecionando...");
            window.location.href = 'index.html';
            return;
        }

        // Se o Sistema.usuario ainda não carregou (race condition), carregamos agora manualmente
        if (!Sistema.usuario) {
            console.log("⚠️ Sistema.usuario vazio. Recuperando perfil...");
            const { data: perfil } = await Sistema.supabase
                .from('usuarios')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (perfil) {
                Sistema.usuario = perfil;
            } else {
                Sistema.usuario = { id: session.user.id, ...session.user };
            }
        }
        // ---------------------------------

        // Define o alvo inicial como o usuário logado
        this.usuarioAlvo = Sistema.usuario.id;

        this.renderizarSeletoresData();

        // Carrega o seletor de equipe (se for admin/gestor)
        await this.carregarSeletorEquipe();

        // Inicia a aba padrão
        this.mudarAba('diario');
    },

    carregarSeletorEquipe: async function() {
        try {
            // Busca usuários ativos para o seletor
            const { data: usuarios, error } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, email')
                .eq('ativo', true)
                .order('nome', { ascending: true });

            if (error) throw error;

            if (usuarios && usuarios.length > 0) {
                const selector = document.getElementById('admin-user-selector');
                const container = document.getElementById('admin-selector-container');
                
                if (selector && container) {
                    selector.innerHTML = '';
                    
                    // Opção 1: Minha Visão
                    const optionMe = document.createElement('option');
                    optionMe.value = Sistema.usuario.id;
                    optionMe.text = "Minha Visão (Eu)";
                    selector.appendChild(optionMe);

                    // Outros Usuários
                    usuarios.forEach(u => {
                        if (u.id !== Sistema.usuario.id) {
                            const opt = document.createElement('option');
                            opt.value = u.id;
                            opt.text = u.nome || u.email;
                            selector.appendChild(opt);
                        }
                    });

                    // Mostra o filtro
                    container.classList.remove('hidden');
                    container.classList.add('flex');
                }
            }
        } catch (err) {
            console.error("Erro seletor equipe:", err);
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        console.log("🔄 Vendo dados de:", novoId);
        this.usuarioAlvo = novoId;
        this.carregarAbaAtual();
    },

    getUsuarioAlvo: function() {
        return this.usuarioAlvo || Sistema.usuario.id;
    },

    getDatasFiltro: function() {
        const ano = parseInt(this.periodo.ano);
        const mes = parseInt(this.periodo.mes);
        let inicio, fim;

        if (this.periodo.tipo === 'mes') {
            const dateIni = new Date(ano, mes, 1);
            const dateFim = new Date(ano, mes + 1, 0);
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        } 
        else if (this.periodo.tipo === 'semana') {
            const weekNum = parseInt(this.periodo.semana);
            const dateIni = new Date(ano, mes, (weekNum - 1) * 7 + 1);
            const dateFim = new Date(ano, mes, (weekNum - 1) * 7 + 7);
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
            if (dateFim.getDate() < dateIni.getDate()) dateFim.setDate(ultimoDiaMes);
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        }
        else if (this.periodo.tipo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        }

        return { inicio, fim };
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`btn-ma-${abaId}`);
        if (btnAtivo) btnAtivo.classList.add('active');

        document.querySelectorAll('.ma-view').forEach(view => view.classList.add('hidden'));
        const viewAtiva = document.getElementById(`ma-tab-${abaId}`);
        if (viewAtiva) viewAtiva.classList.remove('hidden');

        this.abaAtual = abaId;
        this.carregarAbaAtual();
    },

    carregarAbaAtual: function() {
        if (!MinhaArea.getUsuarioAlvo()) return;

        switch(this.abaAtual) {
            case 'diario': if(MinhaArea.Geral) MinhaArea.Geral.carregar(); break;
            case 'metas': if(MinhaArea.Metas) MinhaArea.Metas.carregar(); break;
            case 'auditoria': if(MinhaArea.Auditoria) MinhaArea.Auditoria.carregar(); break;
            case 'comparativo': if(MinhaArea.Comparativo) MinhaArea.Comparativo.carregar(); break;
            case 'feedback': if(MinhaArea.Feedback) MinhaArea.Feedback.carregar(); break;
        }
    },

    mudarPeriodo: function(tipo) {
        this.periodo.tipo = tipo;
        this.renderizarSeletoresData();
        this.salvarEAtualizar();
    },

    salvarEAtualizar: function() {
        this.periodo.ano = document.getElementById('sel-ano').value;
        this.periodo.mes = document.getElementById('sel-mes').value;
        this.carregarAbaAtual();
    },

    renderizarSeletoresData: function() {
        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSub = document.getElementById('sel-subperiodo-ano');
        const btnMes = document.getElementById('btn-periodo-mes');
        const btnSemana = document.getElementById('btn-periodo-semana');
        const btnAno = document.getElementById('btn-periodo-ano');

        [btnMes, btnSemana, btnAno].forEach(b => b.className = "px-3 py-1 text-xs font-bold rounded text-slate-500 hover:bg-white hover:shadow-sm transition");
        [selMes, selSemana, selSub].forEach(s => s.classList.add('hidden'));

        if (this.periodo.tipo === 'mes') {
            selMes.classList.remove('hidden');
            btnMes.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        } else if (this.periodo.tipo === 'semana') {
            selMes.classList.remove('hidden');
            selSemana.classList.remove('hidden');
            btnSemana.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        } else {
            selSub.classList.remove('hidden');
            btnAno.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        }

        const selAno = document.getElementById('sel-ano');
        if (selAno.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            for(let i = anoAtual; i >= 2024; i--) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.text = i;
                selAno.appendChild(opt);
            }
            selAno.value = this.periodo.ano;
        }
        document.getElementById('sel-mes').value = this.periodo.mes;
    }
};

document.addEventListener('DOMContentLoaded', () => { MinhaArea.init(); });