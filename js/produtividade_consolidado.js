const Cons = {
    initialized: false,

    init: async function() {
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('cons-table-body');
        const thead = document.getElementById('cons-table-header');
        
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Consolidando dados...</td></tr>';

        const tipo = document.getElementById('cons-period-type').value;
        const hcInput = document.getElementById('cons-input-hc');
        const baseHC = hcInput ? parseInt(hcInput.value) || 17 : 17;

        // Pega data do seletor GLOBAL
        const globalInput = document.getElementById('global-date');
        const dataRef = globalInput ? globalInput.value : new Date().toISOString().split('T')[0];
        const [gAno, gMes, gDia] = dataRef.split('-').map(Number);

        let s, e;
        let labels = []; 

        // Define Range Baseado na Data Global + Tipo de Período
        if (tipo === 'dia') {
            s = dataRef; e = dataRef;
            labels = ['Dia'];
        } else if (tipo === 'mes') {
            s = `${gAno}-${String(gMes).padStart(2,'0')}-01`;
            e = `${gAno}-${String(gMes).padStart(2,'0')}-${new Date(gAno, gMes, 0).getDate()}`;
            labels = [`${gMes}/${gAno}`];
        } else if (tipo === 'trimestre') {
            const tri = Math.ceil(gMes / 3);
            const mStart = ((tri-1)*3)+1;
            s = `${gAno}-${String(mStart).padStart(2,'0')}-01`;
            e = `${gAno}-${String(mStart+2).padStart(2,'0')}-${new Date(gAno, mStart+2, 0).getDate()}`;
            labels = [`${tri}º Tri`];
        } else if (tipo === 'semestre') {
            const sem = gMes <= 6 ? 1 : 2;
            s = sem === 1 ? `${gAno}-01-01` : `${gAno}-07-01`;
            e = sem === 1 ? `${gAno}-06-30` : `${gAno}-12-31`;
            labels = [`${sem}º Sem`];
        } else { // Anual
            s = `${gAno}-01-01`; e = `${gAno}-12-31`;
            labels = [`${gAno}`];
        }

        try {
            // Busca Produção
            const { data: prods, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade')
                .gte('data_referencia', s)
                .lte('data_referencia', e);

            if (error) throw error;

            let totalGeral = 0;
            let usuariosAtivosSet = new Set();
            
            // Agrupa por usuário para contar headcount real
            prods.forEach(p => {
                const u = Sistema.Dados.usuariosCache[p.usuario_id];
                if (u && u.funcao === 'Assistente') {
                    totalGeral += (Number(p.quantidade) || 0);
                    usuariosAtivosSet.add(p.usuario_id);
                }
            });

            // Atualiza Cards
            const hcReal = usuariosAtivosSet.size;
            const mediaTime = hcReal > 0 ? Math.round(totalGeral / hcReal) : 0;
            const mediaInd = baseHC > 0 ? Math.round(totalGeral / baseHC) : 0;

            const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
            safeSet('cons-p-total', totalGeral.toLocaleString());
            safeSet('cons-p-media-time', mediaTime.toLocaleString());
            safeSet('cons-p-media-ind', mediaInd.toLocaleString());
            safeSet('cons-p-headcount', hcReal);

            // Renderiza Tabela Resumo
            // Nota: Nesta visão simplificada, mostramos o resumo do período selecionado.
            // Se quiser quebrar por sub-períodos (ex: meses dentro do ano), a lógica seria mais complexa.
            // Aqui mantivemos o totalizador do período selecionado.

            if (thead) {
                thead.innerHTML = `
                    <tr class="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wide">
                        <th class="px-6 py-4 text-left">Métrica</th>
                        <th class="px-6 py-4 text-center">Valor do Período (${labels[0]})</th>
                    </tr>
                `;
            }

            if (tbody) {
                tbody.innerHTML = `
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="px-6 py-4 font-bold text-slate-700">Produção Total</td>
                        <td class="px-6 py-4 text-center font-bold text-blue-700">${totalGeral.toLocaleString()}</td>
                    </tr>
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="px-6 py-4 font-bold text-slate-700">HC Ativo (Produziram)</td>
                        <td class="px-6 py-4 text-center text-slate-600">${hcReal}</td>
                    </tr>
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="px-6 py-4 font-bold text-slate-700">Média por Ativo</td>
                        <td class="px-6 py-4 text-center text-emerald-600 font-bold">${mediaTime.toLocaleString()}</td>
                    </tr>
                    <tr class="border-b border-slate-100 hover:bg-slate-50 bg-amber-50/30">
                        <td class="px-6 py-4 font-bold text-slate-700">Média por Base HC (${baseHC})</td>
                        <td class="px-6 py-4 text-center text-amber-600 font-bold">${mediaInd.toLocaleString()}</td>
                    </tr>
                `;
            }

        } catch (err) {
            console.error(err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="text-center text-red-400">Erro ao consolidar dados.</td></tr>';
        }
    }
};